import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {extname,join,sep} from 'node:path';
import {Store,DomainError,hash} from './store';
import {MAX_EVIDENCE_FILE_BYTES,MAX_EVIDENCE_TOTAL_BYTES,type EvidenceFileInput,type EvidenceFile,type RelationshipEvidence} from '../../../packages/contracts/evidence';

function fileMime(bytes:Buffer,name:string){
  if(bytes.length>24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return 'image/png';
  if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)))return 'image/gif';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  if(bytes.toString('ascii',0,5)==='%PDF-')return 'application/pdf';
  if(['.txt','.csv'].includes(extname(name).toLowerCase())){
    try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!text.includes('\0'))return extname(name).toLowerCase()==='.csv'?'text/csv':'text/plain';}catch{}
  }
  // Other formats are preserved verbatim and served as downloads, never executable pages.
  return 'application/octet-stream';
}

export function prepareEvidenceFiles(files:EvidenceFileInput[]){
  let total=0;
  return files.map(file=>{
    const bytes=Buffer.from(file.base64,'base64');total+=bytes.length;
    if(!bytes.length||bytes.length>MAX_EVIDENCE_FILE_BYTES)throw new DomainError(400,'Cada archivo debe tener contenido y pesar como máximo 10 MB.');
    if(total>MAX_EVIDENCE_TOTAL_BYTES)throw new DomainError(400,'Los archivos de una entrega no pueden superar 25 MB en total.');
    if(bytes.toString('base64')!==file.base64)throw new DomainError(400,'El archivo no está codificado correctamente.');
    const name=file.name.replace(/\\/g,'/').split('/').pop()||'documento';
    return {bytes,name,hash:hash(bytes),mime:fileMime(bytes,name)};
  });
}
type PreparedFile=ReturnType<typeof prepareEvidenceFiles>[number];

function preserveFile(store:Store,documentRoot:string,file:PreparedFile){
  const previous=store.one<EvidenceFile&{path:string}>('SELECT * FROM sources WHERE hash=?',file.hash);
  if(previous)return previous;
  const root=realpathSync(documentRoot),uploads=join(root,'originals');
  mkdirSync(uploads,{recursive:true});
  if(!realpathSync(uploads).startsWith(root+sep))throw new DomainError(403,'Carpeta documental no permitida.');
  const directory=join(uploads,file.hash);mkdirSync(directory,{recursive:true});
  if(!realpathSync(directory).startsWith(root+sep))throw new DomainError(403,'Carpeta documental no permitida.');
  const path=join(directory,'original');
  if(existsSync(path)){
    if(!realpathSync(path).startsWith(root+sep)||hash(readFileSync(path))!==file.hash)throw new DomainError(409,'No se pudo verificar el archivo original.');
  }else writeFileSync(path,file.bytes,{flag:'wx'});
  const source={id:randomUUID(),name:file.name,hash:file.hash,mime:file.mime,bytes:file.bytes.length,path:`originals/${file.hash}/original`};
  store.run('INSERT INTO sources(id,name,hash,path,mime,bytes) VALUES(?,?,?,?,?,?)',source.id,source.name,source.hash,source.path,source.mime,source.bytes);
  store.audit('source.uploaded',source.id,null,{name:source.name,hash:source.hash,bytes:source.bytes});
  return source;
}

export function relationshipEvidence(store:Store,relationshipId:string):RelationshipEvidence[]{
  if(!store.one('SELECT id FROM relationships WHERE id=?',relationshipId))throw new DomainError(404,'No se encontró el vínculo.');
  const citations=store.all<Omit<RelationshipEvidence,'files'>>('SELECT id,text,sourceId,sourceRow FROM relationshipEvidence WHERE relationshipId=? ORDER BY rowid',relationshipId);
  const files=store.all<EvidenceFile&{evidenceId:string}>('SELECT f.evidenceId,s.id,f.name,s.mime,s.bytes FROM relationshipEvidenceFiles f JOIN sources s ON s.id=f.sourceId JOIN relationshipEvidence e ON e.id=f.evidenceId WHERE e.relationshipId=? ORDER BY f.rowid',relationshipId);
  return citations.map(c=>({...c,files:files.filter(f=>f.evidenceId===c.id).map(({evidenceId,...file})=>file)}));
}

// Caller wraps citations and attachment references in the same idempotent transaction.
export function addEvidence(store:Store,documentRoot:string,relationshipId:string,text:string,files:PreparedFile[]){
  if(!store.one('SELECT id FROM relationships WHERE id=?',relationshipId))throw new DomainError(404,'No se encontró el vínculo.');
  const note=text||'Archivos adjuntos';
  let citation=store.one<{id:string}>('SELECT id FROM relationshipEvidence WHERE relationshipId=? AND text=?',relationshipId,note);
  const created=!citation;
  if(!citation){citation={id:randomUUID()};store.run('INSERT INTO relationshipEvidence(id,relationshipId,text) VALUES(?,?,?)',citation.id,relationshipId,note);}
  const attached:string[]=[];
  for(const file of files){
    const source=preserveFile(store,documentRoot,file);
    const result=store.run('INSERT OR IGNORE INTO relationshipEvidenceFiles(evidenceId,sourceId,name) VALUES(?,?,?)',citation.id,source.id,file.name);
    if(result.changes)attached.push(source.id);
  }
  if(created||attached.length)store.audit('relationship.evidence-added',relationshipId,null,{evidenceId:citation.id,text:note,sourceIds:attached});
  return relationshipEvidence(store,relationshipId);
}
