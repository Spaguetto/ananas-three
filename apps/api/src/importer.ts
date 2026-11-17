import { parse } from 'csv-parse/sync';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { DomainError, Store, hash, normalize } from './store.js';
import type { ImportRecord } from '../../../packages/contracts/index.js';

const clean=(s:string)=>s.replace(/\ufeff/g,'').trim();
export function suggestedName(label:string) {
  return label.split(/\d|\(|\s+-|(?<!\p{L})(?:FALLECI[OÓ]|FALLECID[OA]|MURI[OÓ]|VIVE|COMBITA|CONTEMPORANEA[SA]?|PRIMA|PERSONA AYUDANTE|NO SE CASO|TUNJA|BOGOT[AÁ]|OCA[ÑN]A|BARRANQUILLA|CUNDINAMARCA|SANTANDER|PRESENTE?|ACTUAL|GIRON|CARTAGENA|TUTA|SANTARROSA|SOGAMOSO|SACHICA|BUESACO|CHIVATA|RUMANIA)(?!\p{L})/iu)[0].trim().replace(/[-\s]+$/,'').replace(/\s+/g,' ')
    // A month can trail a full name before a date; Julio inside a name remains a name.
    .replace(/^(\S+(?:\s+\S+)+)\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)$/iu,'$1')
    .toLocaleLowerCase('es').replace(/(^|[\s"-])\p{L}/gu,s=>s.toLocaleUpperCase('es'));
}
function classify(row:string[]) {
  const label=clean(row[0]??''); const n=normalize(label);
  if(!row.some(x=>clean(x))) return 'empty';
  if(row.length===1 || /^(linea |abuelos |conflicto|no hay |padrinos confirmados|amigo de|pedro i josefa)/.test(n)) return 'note';
  if(/^[_\s]+$/.test(label)|| /^(hijo|hija|mujer|otro|espos[ao]?|pareja|nueva pareja|madre|padre)(\s|$)/.test(n)||label.includes('____')||/\bapellido\b/.test(n)||label.includes('/'))return 'review';
  return suggestedName(label).split(/\s+/).length>=2 ? 'candidate':'review';
}
export function previewImport(store:Store,name:string,raw:Buffer,documentRoot:string) {
  const sha=hash(raw); const existing=store.one<{id:string}>('SELECT id FROM imports WHERE hash=?',sha);
  if(existing)return getBatch(store,existing.id,true);
  // A changed file is staged separately. It never silently adds all of its people.
  let rows:string[][];
  try{new TextDecoder('utf-8',{fatal:true}).decode(raw);rows=parse(raw,{bom:true,relax_column_count:true,skip_empty_lines:false});}catch{throw new DomainError(400,'El CSV no se pudo leer. Revisa las comillas y la codificación UTF-8.');}
  if(rows.length>10000)throw new DomainError(400,'El límite de esta versión es 10.000 registros por archivo.');
  const source=store.one<{id:string}>('SELECT id FROM sources WHERE hash=?',sha);
  const relative=`originals/${sha}/source.csv`; const path=join(documentRoot,relative);
  if(!source){mkdirSync(join(documentRoot,'originals',sha),{recursive:true});if(!existsSync(path))writeFileSync(path,raw,{flag:'wx'});}
  const sourceId=source?.id??randomUUID();
  if(!source)store.run('INSERT INTO sources(id,name,hash,path,mime,bytes) VALUES(?,?,?,?,?,?)',sourceId,basename(name),sha,relative,'text/csv',raw.length);
  const id=randomUUID();store.run('INSERT INTO imports(id,sourceId,hash,name,recordCount) VALUES(?,?,?,?,?)',id,sourceId,sha,basename(name),rows.length);
  const frequencies=new Map<string,number>();
  for(const r of rows){const key=normalize(suggestedName(r[0]??''));frequencies.set(key,(frequencies.get(key)??0)+1);}
  rows.forEach((r,i)=>{
    let classification=classify(r);
    if(classification==='candidate' && (frequencies.get(normalize(suggestedName(r[0])))??0)>1)classification='review';
    store.run('INSERT INTO importRecords(id,batchId,row,label,description,tags,raw,classification) VALUES(?,?,?,?,?,?,?,?)',randomUUID(),id,i+1,clean(r[0]??''),clean(r[1]??''),clean(r[8]??''),JSON.stringify(r),classification);
  });
  return getBatch(store,id,true);
}
export function getBatch(store:Store,id:string,includeRecords=false){
  const batch=store.one<{id:string;sourceId:string;name:string;hash:string;status:string;recordCount:number}>('SELECT * FROM imports WHERE id=?',id);
  if(!batch)throw new DomainError(404,'No se encontró la importación.');
  const counts=Object.fromEntries(store.all<{classification:string;n:number}>('SELECT classification,count(*) n FROM importRecords WHERE batchId=? GROUP BY classification',id).map(x=>[x.classification,x.n]));
  return {...batch,counts,...(includeRecords?{records:store.all<ImportRecord>('SELECT * FROM importRecords WHERE batchId=? ORDER BY row',id)}:{})};
}
export function incorporateRecord(store:Store,recordId:string,name?:string){
  const record=store.one<ImportRecord & {batchId:string}>('SELECT * FROM importRecords WHERE id=?',recordId);
  if(!record)throw new DomainError(404,'No se encontró el registro.');
  if(record.personId)return store.person(record.personId);
  if(record.classification==='empty'||record.classification==='note')throw new DomainError(400,'Este registro es una nota o está vacío; no es una persona.');
  if(record.classification==='review'&&!name)throw new DomainError(400,'Este registro necesita un nombre revisado antes de incorporarse.');
  const person=store.createPerson({name:name??suggestedName(record.label),summary:'',lifeStatus:'unknown'},record.row);
  store.run("UPDATE importRecords SET personId=?,decision='incorporated' WHERE id=?",person.id,recordId);
  store.run("UPDATE imports SET status=CASE WHEN status='preview' THEN 'partial' ELSE status END WHERE id=?",record.batchId);
  const batch=getBatch(store,record.batchId);
  const evidence=`${batch.name}, registro ${record.row}. Transcripción aportada; pendiente de cotejar con el original.`;
  for(const [property,value]of [['Registro original',record.label],['Transcripción',record.description],['Estado declarado en la fuente',record.tags]]) {
    if(value)store.addAssertion({personId:person.id,property,value,evidence,status:'pending'},batch.sourceId,record.row,`${recordId}:${property}`);
  }
  store.audit('import.record.incorporated',recordId,null,{personId:person.id});return person;
}
export function applyBatch(store:Store,id:string){
  const batch=getBatch(store,id);
  // A later file may be a reordered or edited version: explicit row-by-row reconciliation only.
  const other=store.one("SELECT id FROM imports WHERE id!=? AND status IN ('partial','applied') LIMIT 1",id);
  if(other)throw new DomainError(409,'Ya hay otro lote incorporado. Revisa cada registro y vincúlalo a una persona existente para evitar duplicados entre versiones.');
  // Reclassify only unlinked records; never rewrite a name or identity already edited by the family.
  const allRecords=store.all<ImportRecord & {raw:string}>('SELECT * FROM importRecords WHERE batchId=?',id);
  const frequencies=new Map<string,number>();
  for(const r of allRecords){const key=normalize(suggestedName(r.label));frequencies.set(key,(frequencies.get(key)??0)+1);}
  for(const r of allRecords.filter(r=>!r.personId)){
    let classification=classify(JSON.parse(r.raw));
    if(classification==='candidate'&&(frequencies.get(normalize(suggestedName(r.label)))??0)>1)classification='review';
    if(r.classification!==classification){store.run('UPDATE importRecords SET classification=? WHERE id=?',classification,r.id);store.audit('import.record.classified',r.id,{classification:r.classification},{classification});}
  }
  store.run("UPDATE imports SET parserVersion='3' WHERE id=?",id);
  const records=store.all<ImportRecord>("SELECT * FROM importRecords WHERE batchId=? AND classification='candidate' AND personId IS NULL",id);
  records.forEach(r=>incorporateRecord(store,r.id));store.run("UPDATE imports SET status='applied' WHERE id=?",id);
  return {id:batch.id,added:records.length,remaining:store.one<{n:number}>("SELECT count(*) n FROM importRecords WHERE batchId=? AND classification='review' AND personId IS NULL",id)!.n};
}
export function linkRecord(store:Store,recordId:string,personId:string){
  store.person(personId);
  const record=store.one<ImportRecord & {batchId:string}>('SELECT * FROM importRecords WHERE id=?',recordId);
  if(!record)throw new DomainError(404,'No se encontró el registro.');
  if(record.personId && record.personId!==personId)throw new DomainError(409,'Este registro ya está vinculado. La fusión de personas se realizará en una etapa posterior.');
  const batch=getBatch(store,record.batchId);
  for(const [property,value]of [['Registro original',record.label],['Transcripción',record.description],['Estado declarado en la fuente',record.tags]])if(value)store.addAssertion({personId,property,value,evidence:`${batch.name}, registro ${record.row}. Vinculación manual.`,status:'pending'},batch.sourceId,record.row,`${recordId}:${property}`);
  store.run("UPDATE importRecords SET personId=?,decision='linked' WHERE id=?",personId,recordId);
  store.run("UPDATE imports SET status=CASE WHEN status='preview' THEN 'partial' ELSE status END WHERE id=?",record.batchId);
  store.audit('import.record.linked',recordId,null,{personId});return {personId};
}
export function bootstrap(store:Store,documentRoot:string){
  const manifestPath=join(documentRoot,'audit/source-manifest.json');if(!existsSync(manifestPath))return;
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {sources:{name:string;sha256:string;bytes:number;path:string}[]};
  store.tx(()=>{
    for(const s of manifest.sources){
      const path=s.path.replace(/^data\//,'');
      store.run('INSERT OR IGNORE INTO sources(id,name,hash,path,mime,bytes) VALUES(?,?,?,?,?,?)',randomUUID(),s.name,s.sha256,path,s.name.endsWith('.png')?'image/png':s.name.endsWith('.csv')?'text/csv':'text/plain',s.bytes);
    }
    const source=manifest.sources.find(s=>s.name.endsWith('.csv'));if(!source)return;
    const raw=readFileSync(join(documentRoot,source.path.replace(/^data\//,'')));
    if(hash(raw)!==source.sha256)throw new Error('La fuente inicial no coincide con su huella.');
    const batch=previewImport(store,source.name,raw,documentRoot);
    // These mappings were read from explicit transcriptions in the supplied, hash-locked CSV.
    // They are proposals, never verified identities or accepted genealogical facts.
    if(source.sha256!=='5cef3faf27d983747a4aefb5c0ee4606ee2487b1c8d1263c674ff709f4ea9938')return;
    if(store.one("SELECT id FROM audit WHERE action='bootstrap.completed' LIMIT 1"))return;
    const seedRows=[7,8,9,11,12,61,62,63,64,65,67,68,71,80,97,98,107,108,109,110,148,149,154,156,187];
    const people=new Map<number,string>();
    for(const row of seedRows){const r=store.one<ImportRecord>('SELECT * FROM importRecords WHERE batchId=? AND row=?',batch.id,row)!;people.set(row,incorporateRecord(store,r.id,suggestedName(r.label)).id);}
    const links:[number,number,number,'parent'|'godparent'][]=[
      [154,187,187,'parent'],[156,187,187,'parent'],[148,154,154,'parent'],[149,154,154,'parent'],
      [11,156,156,'parent'],[12,156,156,'parent'],[97,148,148,'parent'],[98,148,148,'parent'],
      [110,149,149,'parent'],[109,149,149,'parent'],[7,11,156,'parent'],[8,11,156,'parent'],[9,12,156,'parent'],
      [108,148,148,'godparent'],[107,148,148,'godparent'],[67,80,80,'parent'],[68,80,80,'parent'],
      [64,67,80,'parent'],[65,67,80,'parent'],[62,68,80,'parent'],[63,68,80,'parent'],[61,80,80,'godparent'],[67,71,71,'parent'],[68,71,71,'parent']
    ];
    for(const [from,to,citation,type]of links){
      const r=store.one<ImportRecord>('SELECT * FROM importRecords WHERE batchId=? AND row=?',batch.id,citation)!;
      store.addRelationship({sourceId:people.get(from)!,targetId:people.get(to)!,type,status:'pending',context:type==='godparent'?'Bautismo':'',evidence:`Propuesta de identificación entre registros. ${source.name}, registro ${citation}: ${r.description || r.label}`},batch.sourceId,citation);
    }
    const personId=people.get(154)!;
    store.addAssertion({personId,property:'Nacimiento (cabecera)',value:'9 de mayo de 1912',status:'disputed',evidence:'Registro 154: cabecera del CSV. Difiere de la transcripción del bautismo.'},batch.sourceId,154,`${batch.id}:birth-header`);
    store.addAssertion({personId,property:'Nacimiento (transcripción)',value:'16 de marzo de 1910',status:'disputed',evidence:'Registro 154: bautismo del 22 de marzo de 1910; el texto indica nacimiento el día 16 del presente mes. Interpretación pendiente de cotejo.'},batch.sourceId,154,`${batch.id}:birth-transcription`);
    store.run("UPDATE imports SET status='partial' WHERE id=?",batch.id);store.audit('bootstrap.completed',batch.id,null,{people:seedRows.length,relationships:links.length});
  });
}
