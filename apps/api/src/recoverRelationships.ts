import {Store,DomainError} from './store';
import {getBatch} from './importer';
import type {ImportRecord,Relationship} from '../../../packages/contracts';

// Reviewed against the exact supplied CSV. Rows locate evidence, never imply kinship by proximity.
const sourceHash='5cef3faf27d983747a4aefb5c0ee4606ee2487b1c8d1263c674ff709f4ea9938';
type Mapping=[from:number,to:number,citation:number,type:'parent'|'godparent'|'partner'];
const mappings:Mapping[]=[
  [11,33,33,'parent'],[14,33,33,'parent'],
  [16,37,37,'parent'],[15,37,37,'parent'],[6,16,37,'parent'],[3,15,37,'parent'],[13,37,37,'godparent'],
  [67,72,72,'parent'],[68,72,72,'parent'],[67,73,73,'parent'],[68,73,73,'parent'],
  [86,95,95,'parent'],[85,95,95,'parent'],[78,86,95,'parent'],[76,85,95,'parent'],
  [105,146,146,'parent'],[112,146,146,'godparent'],
  [97,147,147,'parent'],[98,147,147,'parent'],[113,147,147,'godparent'],[100,147,147,'godparent'],
  [103,160,160,'parent'],[104,160,160,'parent'],[84,160,160,'godparent'],[107,160,160,'godparent'],
  [103,163,163,'parent'],[104,163,163,'parent'],[152,163,163,'godparent'],[153,163,163,'godparent'],
  [150,168,168,'parent'],[147,168,168,'parent'],[114,150,168,'parent'],[115,150,168,'parent'],[109,168,168,'godparent'],
  [150,171,171,'parent'],[147,171,171,'parent'],
  [169,172,172,'parent'],[150,169,172,'parent'],[147,169,172,'parent'],[150,172,172,'godparent'],[147,172,172,'godparent'],
  [174,175,175,'parent'],[173,175,175,'parent'],[169,174,175,'parent'],
  [193,322,322,'parent'],[161,322,322,'parent'],[170,193,322,'parent'],
  [148,149,149,'partner'],[154,156,154,'partner'],
];
const unresolved=[
  {row:33,reason:'Faltan identidades inequívocas para Abdón Puerto, Magdalena Cruz y Daniel Hernández; no se crean personas por semejanza de nombre.'},
  {row:37,reason:'Ascensión/Asunción Calderón tiene menciones duplicadas; hay varios Manuel Vargas. La anotación matrimonial contiene una fecha y un sujeto que necesitan cotejo.'},
  {row:71,reason:'Marcelina Bravo y Marulina Díaz aparecen como versiones distintas de una abuela. Los padrinos requieren identificación adicional.'},
  {row:73,reason:'Se conservan sin resolver los padrinos y los nombres incompletos de los abuelos.'},
  {row:95,reason:'«Fruto», «Ramón» y Antonio Hernández no permiten una identificación inequívoca con las fichas actuales.'},
  {row:146,reason:'José María Suárez coincide con varias fichas; los nombres abreviados de abuelos y las alternativas Salas/Salazar/Soler quedan por cotejar.'},
  {row:147,reason:'Los abuelos maternos declarados no coinciden con los del registro 148. No se escoge automáticamente una versión.'},
  {row:148,reason:'Luciano e Isidora figuran como padres de Librada Soto en esta transcripción, frente a otra versión del registro 147.'},
  {row:156,reason:'Ascensión Calderón tiene menciones duplicadas; Mariano Medina y la identificación de Rosana necesitan revisión.'},
  {row:168,reason:'Bernardo López no se equipara automáticamente con Bernardo Soprez.'},
  {row:171,reason:'El padrino «Jesús Suárez» puede confundirse con otras identidades abreviadas.'},
  {row:172,reason:'El padre «Ventura Suárez» requiere cotejo con las fichas de Buenaventura. No se expande automáticamente el nombre.'},
  {row:175,reason:'«Ventura Suárez», Jorge Pava, Ester Quintana, Rosalvina Pava y Raquel Suárez necesitan identificación.'},
  {row:322,reason:'Herminia Prieto y Dorisana López Hernández no tienen ficha inequívoca. Los otros abuelos y padrinos quedan por identificar.'},
  {row:393,reason:'María de Jesús, Buenaventura y Ana Celia tienen varias menciones posibles; la madrina es ilegible. No se selecciona una identidad por el orden de las filas.'},
];
export function relationshipRecovery(store:Store,batchId:string){
  const batch=getBatch(store,batchId);
  if(batch.hash!==sourceHash)return {supported:false,batchId,proposals:[],missing:[],notes:[],newCount:0};
  const records=new Map(store.all<ImportRecord>('SELECT * FROM importRecords WHERE batchId=? ORDER BY row',batchId).map(r=>[r.row,r]));
  const existing=store.all<Relationship>('SELECT * FROM relationships');const missing:{row:number;reason:string}[]=[];
  const proposals=mappings.flatMap(([from,to,citation,type])=>{
    const a=records.get(from),b=records.get(to),source=records.get(citation);
    if(!a?.personId||!b?.personId||!source?.description){missing.push({row:citation,reason:`Primero identifica las fichas de los registros ${from} y ${to}.`});return [];}
    let sourceId=a.personId,targetId=b.personId;if(type==='partner')[sourceId,targetId]=[sourceId,targetId].sort();
    const context=type==='godparent'?'Bautismo':type==='partner'?(citation===149?'Viudez mencionada':'Matrimonio mencionado'):'';
    const current=existing.find(r=>r.sourceId===sourceId&&r.targetId===targetId&&r.type===type&&r.context===context);
    const evidence=`Identificación propuesta entre las fichas de los registros ${from} y ${to}. Se deben cotejar nombres abreviados y variantes; no equivale a una identidad verificada. ${batch.name}, registro ${citation}: ${source.description}`;
    return [{sourceId,targetId,type,context,evidence,sourceRow:citation,fromRow:from,toRow:to,sourceName:store.person(sourceId).name,targetName:store.person(targetId).name,existing:!!current,status:current?.status??'pending'}];
  });
  return {supported:true,batchId,proposals,missing,notes:unresolved,newCount:proposals.filter(p=>!p.existing).length};
}
export function applyRelationshipRecovery(store:Store,batchId:string){
  const preview=relationshipRecovery(store,batchId);if(!preview.supported)throw new DomainError(400,'Este lote no corresponde a las transcripciones revisadas.');
  const batch=getBatch(store,batchId);let added=0;const citationsBefore=store.one<{n:number}>('SELECT COUNT(*) n FROM relationshipEvidence')!.n;
  for(const p of preview.proposals){store.addRelationship({sourceId:p.sourceId,targetId:p.targetId,type:p.type,context:p.context,evidence:p.evidence,status:'pending'},batch.sourceId,p.sourceRow);if(!p.existing)added++;}
  const citationsAdded=store.one<{n:number}>('SELECT COUNT(*) n FROM relationshipEvidence')!.n-citationsBefore;
  if(added||citationsAdded)store.audit('import.relationships.recovered',batchId,null,{version:1,added,citationsAdded,missing:preview.missing});
  return {added,citationsAdded,unresolved:preview.notes.length,missing:preview.missing.length};
}
