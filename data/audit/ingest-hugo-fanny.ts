// Private, reviewed transcription of the user's family diagrams and notes.
// Run without --apply to validate on a backup; --apply writes to the local app database.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Store,hash} from '../../apps/api/src/store.ts';
import {NetworkStore} from '../../apps/api/src/network.ts';
import {nodeInput} from '../../packages/contracts/network.ts';

const expected:Record<number,string>={
  11:'Francisco Fonseca',12:'Nieves Rodriguez Calderón',
  148:'Nereo Angel Maria Suarez Soto',149:'Gertrudis Hernandez Sierra',
  154:'Ramón Aquileo Suárez Hernandez',156:'Maria Esther Fonseca Rodriguez Cruz Rodriguez Calderon',
  187:'Hugo Auli Suarez Fonseca',210:'Fanny Jacome Lazaro',
  116:'Julio Lázaro Chaustre',117:'Ofelia Melo',118:'Lola Roca',119:'Eduardo Jacome Jacome',
  120:'Carlos Julio Jacome Roca',121:'Olga Maria Lázaro Melo',
  317:'Laila Luz Páez Arengas',318:'Olga Viviana',319:'Carlos Antonio Porto Salvar',320:'Victor Hugo',
  360:'Ana María Porto Suárez',361:'Maria Jose Porto Suárez',
};
type Group={key:string;pair:[number,number];children:number[];evidence:string};
const groups:Group[]=[
  {key:'nereo-gertrudis',pair:[148,149],children:[154],evidence:'La transcripción del bautismo de Hugo identifica a Nereo Suárez y Gertrudis Hernández como abuelos paternos. El registro 154 identifica a ambos como padres de Ramón Aquileo; los registros 148 y 149 y los vínculos ya existentes resuelven sus fichas completas.'},
  {key:'francisco-nieves',pair:[11,12],children:[156],evidence:'La transcripción del bautismo de Hugo identifica a Francisco Fonseca y Nieves Rodríguez como abuelos maternos. El registro 156 identifica a ambos como padres de María Ester; se reutilizan las identidades y filiaciones existentes.'},
  {key:'ramon-esther',pair:[154,156],children:[187],evidence:'El bautismo transcrito de Hugo lo identifica como hijo de Ramón Aquileo Suárez y Ester Fonseca. La imagen 2 muestra la unión entre Ramón Aquileo y María Esther. La correspondencia de nombres se conserva como pendiente de revisión.'},
  {key:'eduardo-lola',pair:[119,118],children:[120],evidence:'Imagen 3, parte superior izquierda: círculo de unión entre Lola Roca y Eduardo Jácome Jácome, con línea descendente a Carlos Julio Jácome Roca.'},
  {key:'julio-ofelia',pair:[116,117],children:[121],evidence:'Imagen 3, parte superior: círculo de unión entre Ofelia Melo y Julio Lázaro Chaustre, con línea descendente a Olga María Lázaro Melo.'},
  {key:'carlos-olga',pair:[120,121],children:[210],evidence:'Lectura conjunta de las imágenes 1 y 3 y del contexto familiar aportado: la rama de Carlos Julio Jácome Roca y Olga María Lázaro Melo continúa hacia Fanny Jácome Lázaro. La conexión cruza los límites de los recortes; se registra como propuesta pendiente, no como verificación documental.'},
  {key:'hugo-fanny',pair:[187,210],children:[320,318],evidence:'Imagen 1: círculo de unión entre Hugo Aulí Suárez Fonseca y Fanny Jácome Lázaro. El tronco desciende y se bifurca hacia Víctor Hugo y Olga Viviana.'},
  {key:'olga-carlos',pair:[318,319],children:[360,361],evidence:'Imagen 1: círculo entre Olga Viviana y Carlos Antonio Porto; de él descienden Ana María Porto Suárez y María José Porto Suárez. La palabra «salvar» en el nombre importado de Carlos queda por aclarar.'},
  {key:'victor-laila',pair:[320,317],children:[],evidence:'Imagen 1: línea horizontal entre Laila Luz Páez Arengas y Víctor Hugo. Se registra como pareja, sin afirmar matrimonio ni descendencia. Laila no se registra como hija de Hugo y Fanny.'},
];
const notes=[
  'Alcance autorizado: Hugo y Fanny, sus padres y abuelos, sus hijos, las parejas de estos y sus dos nietas mostradas. No se agregan las ramas Gandur ni los hermanos de la pareja.',
  'Se reutilizan las 20 fichas existentes; no se fusionan identidades, no se completan apellidos, ni se alteran nombres, fechas, campos personales o revisiones previas.',
  'Todos los vínculos nuevos quedan pendientes de cotejo. Las parejas y los nodos de unión no afirman matrimonio, fechas, vigencia ni naturaleza biológica de la filiación.',
  'Los nombres completos de Nereo, Gertrudis y Nieves se cotejan con los registros 148, 149, 154 y 156 y las filiaciones ya guardadas.',
  'Esta fuente es una transcripción descriptiva de las imágenes y notas del chat del 17 de noviembre de 2026; no es un archivo original de imagen ni un acta original.',
];
const manifest={version:1,sourceDate:'2026-11-17',expected,groups,notes};
const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n','utf8'),sha=hash(bytes);
const sourceName='Hugo y Fanny — transcripción de relaciones aportadas (17 noviembre 2026)';
const root=resolve('data'),original=join(root,'database/family.sqlite');
const apply=process.argv.includes('--apply');
mkdirSync(join(root,'backups'),{recursive:true});
const backup=join(root,apply?'backups':'audit',`${apply?'before':'preview'}-hugo-fanny-${Date.now()}.sqlite`);
const connection=new DatabaseSync(original,{readOnly:true});
connection.prepare('VACUUM INTO ?').run(backup);connection.close();
const store=new Store(apply?original:backup),network=new NetworkStore(store);
const tables=['people','personFields','assertions','relationships','relationshipEvidence','graphNodes','graphConnections','graphCitations','sources','importRecords'];
const before=Object.fromEntries(tables.map(t=>[t,store.all<{id:string}>(`SELECT * FROM ${t} ORDER BY id`)]));
const relative=`originals/${sha}/relaciones-hugo-fanny.txt`;
if(apply){mkdirSync(join(root,'originals',sha),{recursive:true});if(!existsSync(join(root,relative)))writeFileSync(join(root,relative),bytes,{flag:'wx'});assert.equal(hash(readFileSync(join(root,relative))),sha);}

const operation=()=>store.request('family-branch:hugo-fanny:2026-11-17:v1','family-branch.reviewed-import',manifest,()=>{
  const batch=store.one<{id:string}>('SELECT id FROM imports WHERE hash=?','5cef3faf27d983747a4aefb5c0ee4606ee2487b1c8d1263c674ff709f4ea9938');assert.ok(batch);
  const people=new Map<number,{id:string;name:string}>();
  for(const [row,name] of Object.entries(expected)){
    const matches=store.all<{id:string;name:string}>('SELECT p.id,p.name FROM importRecords r JOIN people p ON p.id=r.personId WHERE r.batchId=? AND r.row=?',batch.id,Number(row));
    assert.equal(matches.length,1,`Ambiguous identity at record ${row}`);assert.equal(matches[0].name,name);people.set(Number(row),{...matches[0]});
  }
  let source=store.one<{id:string}>('SELECT id FROM sources WHERE hash=?',sha);
  if(!source){source={id:randomUUID()};store.run('INSERT INTO sources(id,name,hash,path,mime,bytes) VALUES(?,?,?,?,?,?)',source.id,sourceName,sha,relative,'text/plain',bytes.length);store.audit('source.registered',source.id,null,{name:sourceName,hash:sha,path:relative});}
  const results=[];
  for(const group of groups){
    const pair=group.pair.map(row=>people.get(row)!);
    const evidence=`${sourceName}. Fuente ${source.id}; SHA-256 ${sha}. ${group.evidence}`;
    const existing=network.entities('union').filter(n=>{
      const members=network.detail(n.id).connections.filter(c=>c.type==='spouse').map(c=>c.sourceId).sort();
      return JSON.stringify(members)===JSON.stringify(pair.map(p=>p.id).sort());
    });
    assert.equal(existing.length,0,`Unexpected existing union for ${group.key}; review before adding.`);
    const union=network.save(nodeInput.parse({kind:'union',label:pair.map(p=>p.name).join(' y '),description:'Unión familiar aportada en las imágenes y transcripciones. Naturaleza, fechas y estado sin determinar.',category:'Pareja del árbol familiar',unionState:'unknown',status:'pending',evidence}));
    for(const person of pair)network.link({sourceId:person.id,targetId:union.id,type:'spouse',status:'pending',evidence});
    const partnerMatches=store.all<{id:string;context:string;status:string}>("SELECT id,context,status FROM relationships WHERE type='partner' AND ((sourceId=? AND targetId=?) OR (sourceId=? AND targetId=?))",pair[0].id,pair[1].id,pair[1].id,pair[0].id);
    assert.ok(partnerMatches.length<=1,`Multiple existing partnerships for ${group.key}`);
    assert.ok(!partnerMatches.some(r=>r.status==='rejected'),'Do not recreate a rejected relationship');
    const partner=store.addRelationship({sourceId:pair[0].id,targetId:pair[1].id,type:'partner',context:partnerMatches[0]?.context??'',status:'pending',evidence},source.id);
    const children=group.children.map(row=>people.get(row)!);
    const parentIds:string[]=[];
    for(const child of children){
      network.link({sourceId:child.id,targetId:union.id,type:'union_child',status:'pending',evidence});
      for(const parent of pair){
        const existingParents=store.all<{context:string;status:string}>("SELECT context,status FROM relationships WHERE type='parent' AND sourceId=? AND targetId=?",parent.id,child.id);
        assert.ok(existingParents.length<=1);assert.ok(!existingParents.some(r=>r.status==='rejected'));
        parentIds.push(store.addRelationship({sourceId:parent.id,targetId:child.id,type:'parent',context:existingParents[0]?.context??'',status:'pending',evidence:`${evidence} Filiación: ${parent.name} → ${child.name}.`},source.id).id);
      }
    }
    results.push({key:group.key,unionId:union.id,partnerId:partner.id,parentIds,partners:pair,children});
  }
  for(const [row,person] of people){
    const details=groups.filter(g=>g.pair.includes(row)||g.children.includes(row)).map(g=>g.evidence).join('\n');
    store.addAssertion({personId:person.id,property:'Relaciones familiares — rama Hugo y Fanny',value:details,evidence:`${sourceName}. Ficha reutilizada del registro ${row} del CSV original. ${notes[4]}`,status:'pending'},source.id,null,`hugo-fanny:${sha}:${person.id}`);
  }
  const memberIds=[...people.values()].map(p=>p.id);
  const visible=network.around(people.get(187)!.id,5,true,true);
  for(const id of memberIds)assert.ok(visible.people.some(p=>p.id===id),'Every branch member must be reachable from Hugo');
  assert.equal(new Set(results.flatMap(g=>g.parentIds)).size,20);
  assert.equal(new Set(results.map(g=>g.partnerId)).size,9);
  assert.deepEqual(store.all('PRAGMA foreign_key_check'),[]);
  const result={sourceId:source.id,sha,people:memberIds,groups:results,notes};
  store.audit('family-branch.imported',source.id,null,result);return result;
});
try{
  const result=operation();
  const first=store.all('SELECT * FROM audit ORDER BY id');
  assert.deepEqual(operation(),result);assert.deepEqual(store.all('SELECT * FROM audit ORDER BY id'),first);
  for(const [table,rows] of Object.entries(before))for(const row of rows)assert.deepEqual(store.one(`SELECT * FROM ${table} WHERE id=?`,row.id),row,`Existing row changed: ${table}/${row.id}`);
  assert.deepEqual(store.all('PRAGMA foreign_key_check'),[]);assert.equal(store.one<{quick_check:string}>('PRAGMA quick_check')!.quick_check,'ok');
  const deltas=Object.fromEntries(tables.map(t=>[t,store.all(`SELECT id FROM ${t}`).length-before[t].length]));
  const report={mode:apply?'applied':'preview',backup,result,deltas,checks:{priorRowsUnchanged:true,replayUnchanged:true,foreignKeys:true,integrity:true,all20PeopleReachable:true},stats:store.stats()};
  writeFileSync(join(root,'audit',`hugo-fanny-${apply?'result':'preview'}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode:report.mode,backup,deltas,checks:report.checks,stats:report.stats},null,2));
}finally{store.close();}
