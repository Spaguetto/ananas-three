import {Store,normalize,hash,DomainError} from './store';
import {existsSync,mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import type {Assertion} from '../../../packages/contracts';
import type {PlatePersonInfo,PlateDate} from '../../../packages/contracts/plates';

// Only explicit biographical dates reach the print editor; arbitrary personal fields do not.
export function platePeople(store:Store,ids:string[]):PlatePersonInfo[]{
  return [...new Set(ids)].map(id=>{
    store.person(id);
    const assertions=store.all<Assertion>("SELECT * FROM assertions WHERE personId=? AND status!='rejected' ORDER BY id",id);
    const fields=store.fields(id).filter(f=>!f.sensitive);
    const collect=(pattern:RegExp):PlateDate[]=>[
      ...fields.filter(f=>pattern.test(normalize(f.label))&&typeof f.value==='string').map(f=>({value:String(f.value).slice(0,120),status:'pending' as const,origin:'Campo personal: '+f.label})),
      ...assertions.filter(a=>pattern.test(normalize(a.property))).map(a=>({value:a.value.slice(0,120),status:a.status,origin:a.property})),
    ];
    return {id,birth:collect(/^(fecha de )?nacimiento(?:\s*\([^)]*\))?$/),death:collect(/^(fecha de )?(defuncion|fallecimiento|muerte)(?:\s*\([^)]*\))?$/),original:assertions.find(a=>a.property==='Registro original')?.value??''};
  });
}

export function savePlate(documentRoot:string,base64:string,title:string){
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<45||bytes.length>32*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(8)!==13)throw new DomainError(400,'La lámina debe ser un PNG válido de hasta 32 MB.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height||width>8192||height>8192||width*height>24_000_000)throw new DomainError(400,'Las dimensiones de la lámina superan el límite.');
  let offset=8,hasData=false,ended=false;
  while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),end=offset+12+length;if(end>bytes.length)throw new DomainError(400,'El PNG está incompleto.');const kind=bytes.toString('ascii',offset+4,offset+8);if(kind==='IDAT')hasData=true;if(kind==='IEND'){ended=length===0&&end===bytes.length;break;}offset=end;}
  if(!hasData||!ended)throw new DomainError(400,'El PNG está incompleto.');
  const digest=hash(bytes),root=realpathSync(documentRoot),directory=join(root,'exports');mkdirSync(directory,{recursive:true});
  if(!realpathSync(directory).startsWith(root+sep))throw new DomainError(403,'La carpeta de exportación está fuera del archivo.');
  const path=join(directory,`${digest}.png`);if(!existsSync(path))writeFileSync(path,bytes,{flag:'wx'});
  if(!realpathSync(path).startsWith(root+sep)||hash(readFileSync(path))!==digest)throw new DomainError(409,'No se pudo verificar la lámina guardada.');
  const filename=(normalize(title).replace(/[^a-z0-9 -]/g,'').trim().slice(0,80)||'arbol-familiar')+'.png';
  return {hash:digest,filename,width,height,path:`exports/${digest}.png`,url:`/api/plates/files/${digest}`};
}
export function platePath(documentRoot:string,digest:string){
  if(!/^[a-f0-9]{64}$/.test(digest))throw new DomainError(400,'Identificador de lámina no válido.');
  const root=realpathSync(documentRoot),path=resolve(root,'exports',digest+'.png');
  if(!existsSync(path)||!realpathSync(path).startsWith(root+sep))throw new DomainError(404,'No se encontró la lámina.');
  return path;
}
