// Reviewed visual transcription of one user-supplied crop; not an OCR importer.
// Private research material, excluded from version control by data/.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {Store,hash} from '../../apps/api/src/store.ts';
import {NetworkStore} from '../../apps/api/src/network.ts';
import {nodeInput} from '../../packages/contracts/network.ts';

const root=resolve('data');
const input='C:/Users/User/AppData/Local/Temp/codex-clipboard-c0c115b0-2a1b-450c-9b37-56697e4f7dc7.png';
const bytes=readFileSync(input),sha=hash(bytes);
const sourceName='Recorte 01 — ramas Moreno y Rincón (imagen aportada)';
const csvHash='5cef3faf27d983747a4aefb5c0ee4606ee2487b1c8d1263c674ff709f4ea9938';
const expected:Record<number,string>={
  166:'José Leonidas Moreno Piñeros',167:'Cristina Niño Ulloa',
  206:'Gloria Inés',207:'Alberto Moreno Niño',208:'Alicia Puente Dios',204:'Luis Alfonso Rincon Cendalez',
  293:'Ramón Alexander Moreno Suarez',307:'Rocio Eliana Dueñas Pacheco',308:'Selene Patricia Charris Montaño',
  299:'Jose Alberto Moreno Suarez',303:'Angela Jimenez',304:'Johana Moreno Suarez',309:'Ferney Rivera Arciengas',
  301:'Kelly Nataly',302:'Juan Tellez',310:'Ana Maria Rincón Suárez',
  355:'Felipe Moreno Dueñas',356:'Valeria Moreno Charris',354:'Sofia Moreno Jimenez',357:'Alejandra Moreno Jimenez',
  358:'Mariana Rivera',359:'Phillip Benjamin',
};
type Group={key:string;pair:[number,number];children:number[];location:string;note?:string};
const groups:Group[]=[
  {key:'leonidas-cristina',pair:[166,167],children:[207],location:'Parte superior central; círculo entre José Leonidas y Cristina, línea roja vertical hasta Alberto.',note:'El usuario aclaró que la línea roja indica una relación por confirmar. Se mantiene pendiente.'},
  {key:'gloria-alberto',pair:[206,207],children:[293,299,304],location:'Centro izquierdo; círculo entre Gloria y Alberto y tronco que se divide hacia Ramón Alexander, Jose Alberto y Johana.'},
  {key:'alicia-luis',pair:[208,204],children:[301,310],location:'Derecha; círculo entre Alicia y Luis Alfonso, bifurcación hacia Kelly Nataly y Ana Maria.'},
  {key:'ramon-rocio',pair:[293,307],children:[355],location:'Abajo a la izquierda; círculo entre Rocio y Ramón Alexander, línea vertical hacia Felipe.'},
  {key:'ramon-selene',pair:[293,308],children:[356],location:'Abajo a la izquierda; segundo círculo de Ramón Alexander, junto a Selene, con línea hacia Valeria.'},
  {key:'jose-angela',pair:[299,303],children:[354,357],location:'Abajo en el centro; círculo entre Jose Alberto y Angela, bifurcación hacia Sofia y Alejandra.'},
  {key:'johana-ferney',pair:[304,309],children:[358],location:'Abajo en el centro; círculo entre Johana y Ferney, línea vertical hacia Mariana.'},
  {key:'kelly-juan',pair:[301,302],children:[359],location:'Abajo a la derecha; círculo entre Kelly Nataly y Juan, línea vertical hacia Phillip Benjamin.'},
];
const notes=[
  'Todas las relaciones son propuestas de lectura visual; las personas conservan sus UUID y nombres existentes.',
  'Los círculos entre dos personas se registran como uniones o parejas de tipo no determinado; no prueban matrimonio, divorcio, vigencia ni orden temporal.',
  'Las líneas que salen por el borde superior o izquierdo, incluidas las de Gloria y Alicia, no tienen su otro extremo visible y no se registran.',
  'No se completan apellidos ausentes ni se trasladan fechas, lugares o estados de vida desde esta imagen.',
  'Los nombres se cotejaron con los registros del CSV y las etiquetas de la imagen. No se fusionan identidades por apellido.',
];
const manifest={version:1,sha,sourceName,csvHash,expected,groups,notes};
const apply=process.argv.includes('--apply');
const original=join(root,'database/family.sqlite');
mkdirSync(join(root,'backups'),{recursive:true});
const backup=join(root,apply?'backups':'audit',`${apply?'before-crop-01':'crop-01-preview'}-${Date.now()}.sqlite`);
const connection=new DatabaseSync(original,{readOnly:true});
connection.prepare('VACUUM INTO ?').run(backup);connection.close();
const store=new Store(apply?original:backup),network=new NetworkStore(store);
const before=Object.fromEntries(['people','personFields','assertions','relationships','graphNodes','graphConnections','sources'].map(t=>[t,store.all<{id:string}>(`SELECT * FROM ${t} ORDER BY id`)]));
const relative=`originals/${sha}/source.png`,saved=join(root,relative);
if(apply){mkdirSync(join(root,'originals',sha),{recursive:true});if(!existsSync(saved))writeFileSync(saved,bytes,{flag:'wx'});assert.equal(hash(readFileSync(saved)),sha);}
const operation=()=>store.request(`visual-crop:${sha}`,'visual-crop.reviewed-import',manifest,()=>{
  const batch=store.one<{id:string}>('SELECT id FROM imports WHERE hash=?',csvHash);assert.ok(batch,'The reviewed CSV must exist.');
  const people=new Map<number,{id:string;name:string}>();
  for(const [row,name] of Object.entries(expected)){
    const matches=store.all<{id:string;name:string}>('SELECT p.id,p.name FROM importRecords r JOIN people p ON p.id=r.personId WHERE r.batchId=? AND r.row=?',batch.id,Number(row));
    assert.equal(matches.length,1,`Ambiguous or missing identity at row ${row}`);assert.equal(matches[0].name,name,`Identity changed at row ${row}`);people.set(Number(row),{...matches[0]});
  }
  let source=store.one<{id:string}>('SELECT id FROM sources WHERE hash=?',sha);
  if(!source){source={id:randomUUID()};store.run('INSERT INTO sources(id,name,hash,path,mime,bytes) VALUES(?,?,?,?,?,?)',source.id,sourceName,sha,relative,'image/png',bytes.length);store.audit('source.registered',source.id,null,{name:sourceName,hash:sha,path:relative});}
  const evidence=(g:Group)=>`${sourceName}. Fuente ${source!.id}; SHA-256 ${sha}. ${g.location} Lectura visual propuesta, pendiente de revisión. ${g.note??''}`.trim();
  const results=[];
  for(const g of groups){
    const partners=g.pair.map(row=>people.get(row)!);
    const node=network.save(nodeInput.parse({kind:'union',label:`${partners[0].name} y ${partners[1].name}`,description:'Unión representada en el recorte aportado; naturaleza y estado por determinar.',category:'Pareja representada en el árbol',unionState:'unknown',evidence:evidence(g),status:'pending'}));
    for(const p of partners)network.link({sourceId:p.id,targetId:node.id,type:'spouse',status:'pending',evidence:evidence(g)});
    const children=g.children.map(row=>people.get(row)!);
    for(const child of children){
      network.link({sourceId:child.id,targetId:node.id,type:'union_child',status:'pending',evidence:evidence(g)});
      // Parent edges are explicit reviewed observations, not an inference made by NetworkStore.
      for(const parent of partners)store.addRelationship({sourceId:parent.id,targetId:child.id,type:'parent',status:'pending',context:'',evidence:`${evidence(g)} Filiación propuesta: ${parent.name} → ${child.name}.`},source.id);
    }
    results.push({key:g.key,unionId:node.id,partners,children});
  }
  for(const [row,p] of people){
    const locations=groups.filter(g=>g.pair.includes(row)||g.children.includes(row)).map(g=>g.location).join(' ');
    store.addAssertion({personId:p.id,property:'Referencia visual — recorte 01',value:`Ficha identificada como ${p.name} en la imagen aportada. ${locations}`,evidence:`${sourceName}. Correspondencia propuesta con el registro ${row} del CSV; no verifica la identidad.`,status:'pending'},source.id,null,`visual:${sha}:person:${p.id}`);
  }
  const result={sourceId:source.id,sha,people:people.size,unions:results,parentObservations:groups.reduce((sum,g)=>sum+g.children.length*2,0),notes};
  store.audit('visual-crop.imported',source.id,null,result);return result;
});
try{
  const result=operation();
  const afterFirst=store.all('SELECT * FROM audit ORDER BY id');
  assert.deepEqual(operation(),result,'Exact replay must return the same IDs.');
  assert.deepEqual(store.all('SELECT * FROM audit ORDER BY id'),afterFirst,'Replay must not create mutations.');
  for(const [table,rows] of Object.entries(before))for(const row of rows)assert.deepEqual(store.one(`SELECT * FROM ${table} WHERE id=?`,row.id),row,`Pre-existing ${table}/${row.id} changed`);
  assert.deepEqual(store.all('PRAGMA foreign_key_check'),[]);assert.equal(store.one<{quick_check:string}>('PRAGMA quick_check')!.quick_check,'ok');
  const report={mode:apply?'applied':'preview-on-backup',backup,result,stats:store.stats(),overview:network.overview(true,true).overview,checks:{priorRowsUnchanged:true,replayUnchanged:true,foreignKeys:true,integrity:true}};
  writeFileSync(join(root,'audit',`crop-01-${apply?'result':'preview'}.json`),JSON.stringify(report,null,2));
  writeFileSync(join(root,'audit','crop-01-manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({mode:report.mode,people:result.people,unions:result.unions.length,parentObservations:result.parentObservations,stats:report.stats,overview:report.overview,checks:report.checks,backup},null,2));
}finally{store.close();}
