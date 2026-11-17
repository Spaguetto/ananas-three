import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store } from '../apps/api/src/store';
import { applyBatch,bootstrap,getBatch,incorporateRecord,linkRecord,previewImport } from '../apps/api/src/importer';
import { buildApp } from '../apps/api/src/app';
import type { Person,ImportRecord } from '../packages/contracts';

function fixture(){const dir=mkdtempSync(join(tmpdir(),'entre-ramas-test-'));return {dir,store:new Store(':memory:')};}
const person=(s:Store,name='Persona de prueba')=>s.createPerson({name,summary:'',lifeStatus:'unknown'});
const parent=(s:Store,a:Person,b:Person,status:'pending'|'supported'|'rejected'='pending')=>s.addRelationship({sourceId:a.id,targetId:b.id,type:'parent',status,context:'',evidence:'Acta de prueba'});

test('stable identity, accent insensitive search, homonyms and optimistic edits',()=>{
  const {store:s}=fixture();try{const a=person(s,'María Suárez'),b=person(s,'María Suárez');assert.notEqual(a.id,b.id);assert.equal(s.people('maria suarez').total,2);
    const next=s.tx(()=>s.updatePerson(a.id,{name:'María Suárez Gómez',summary:'Relato',lifeStatus:'unknown',version:1}));assert.equal(next.id,a.id);assert.equal(next.version,2);
    assert.throws(()=>s.tx(()=>s.updatePerson(a.id,{name:'Cambio antiguo',summary:'',lifeStatus:'unknown',version:1})),/cambió/);
    assert.equal(s.people('%').total,0);
  }finally{s.close();}
});
test('directed ancestry prevents cycles and missing references, social loops are allowed',()=>{
  const {store:s}=fixture();try{const a=person(s,'Persona A'),b=person(s,'Persona B'),c=person(s,'Persona C');s.tx(()=>{parent(s,a,b);parent(s,b,c);});
    assert.throws(()=>s.tx(()=>parent(s,c,a)),/ciclo/);assert.throws(()=>s.tx(()=>parent(s,a,{...b,id:randomUUID()})),/encontró/);assert.throws(()=>s.tx(()=>parent(s,a,a)),/diferentes/);
    s.tx(()=>s.addRelationship({sourceId:c.id,targetId:a.id,type:'close',context:'',evidence:'Amistad documentada',status:'supported'}));
    assert.equal(s.graph(a.id,3,true,'all').relationships.length,3);assert.equal(s.graph(a.id,3,false,'parent').relationships.length,0);
    const rejected=s.tx(()=>parent(s,c,a,'rejected'));assert.throws(()=>s.tx(()=>s.review('relationships',rejected.id,'supported',rejected.version)),/ciclo/);
  }finally{s.close();}
});
test('shared ancestor is not a cycle; duplicate edges collect citations',()=>{
  const {store:s}=fixture();try{const a=person(s),b=person(s),c=person(s),d=person(s);s.tx(()=>{parent(s,a,b);parent(s,a,c);parent(s,b,d);parent(s,c,d);});assert.equal(s.graph(a.id,3,true,'parent').people.length,4);
    const first=s.tx(()=>parent(s,a,b));const second=s.tx(()=>s.addRelationship({...first,evidence:'Otra acta de prueba'}));assert.equal(first.id,second.id);assert.equal(s.stats().relationships,4);assert.equal(s.all('SELECT * FROM relationshipEvidence WHERE relationshipId=?',first.id).length,2);
  }finally{s.close();}
});
test('requests replay once, conflict on changed bodies, and roll back every write on failure',()=>{
  const {store:s}=fixture();try{const key=randomUUID();const a=s.request(key,'create',{name:'A'},()=>person(s));const b=s.request(key,'create',{name:'A'},()=>person(s));assert.equal(a.id,b.id);assert.equal(s.stats().people,1);
    assert.throws(()=>s.request(key,'create',{name:'B'},()=>person(s)),/otros datos/);
    assert.throws(()=>s.request('rollback-key','create',{},()=>{person(s);throw new Error('forced');}),/forced/);assert.equal(s.stats().people,1);
    assert.equal(s.all("SELECT * FROM requests WHERE key='rollback-key'").length,0);
  }finally{s.close();}
});
test('preview and repeated application preserve source bytes, first row, and manual edits',()=>{
  const {store:s,dir}=fixture();try{const raw=Buffer.from('\ufeff"ANA SUAREZ","Texto uno","","","","","","","NACIMIENTO CONFIRMADO"\r\n"LUIS PEREZ","Texto dos","","","","","","",""\r\n"____","","","","","","","",""\r\n"Nota de investigación"\r\n');
    const batch=s.tx(()=>previewImport(s,'familia.csv',raw,dir));assert.equal(batch.recordCount,4);assert.equal(batch.counts.candidate,2);assert.equal(s.stats().people,0);
    const source=s.one<{path:string}>('SELECT * FROM sources')!;assert.deepEqual(readFileSync(join(dir,source.path)),raw);
    const first=s.tx(()=>applyBatch(s,batch.id));assert.equal(first.added,2);const people=s.people().items;assert.equal(people.length,2);
    const p=people[0];s.tx(()=>s.updatePerson(p.id,{...p,name:'Nombre corregido',version:p.version}));
    assert.equal(s.tx(()=>previewImport(s,'otra-etiqueta.csv',raw,dir)).id,batch.id);assert.equal(s.tx(()=>applyBatch(s,batch.id)).added,0);assert.equal(s.person(p.id).name,'Nombre corregido');
    const assertions=s.all<{status:string;property:string}>('SELECT * FROM assertions');assert.ok(assertions.every(a=>a.status==='pending'));
    const changed=s.tx(()=>previewImport(s,'version2.csv',Buffer.from('"LUIS PEREZ","Texto dos"\n"ANA SUAREZ","Texto uno"'),dir));assert.notEqual(changed.id,batch.id);assert.throws(()=>s.tx(()=>applyBatch(s,changed.id)),/otro lote/);
    const record=getBatch(s,changed.id,true).records![0];s.tx(()=>linkRecord(s,record.id,p.id));assert.equal(s.stats().people,2);
  }finally{s.close();}
});
test('ambiguous duplicate names remain for review and contradictory facts coexist',()=>{
  const {store:s,dir}=fixture();try{const batch=s.tx(()=>previewImport(s,'duplicates.csv',Buffer.from('"MARIA SUAREZ","Primera"\n"MARIA SUAREZ","Segunda"'),dir));assert.equal(batch.counts.review,2);
    const records=batch.records!;assert.throws(()=>s.tx(()=>incorporateRecord(s,records[0].id)),/nombre revisado/);
    const a=s.tx(()=>incorporateRecord(s,records[0].id,'María Suárez'));const b=s.tx(()=>incorporateRecord(s,records[1].id,'María Suárez'));assert.notEqual(a.id,b.id);
    for(const year of ['1910','1912'])s.tx(()=>s.addAssertion({personId:a.id,property:'Nacimiento',value:year,evidence:'Documentos contradictorios',status:'disputed'}));
    assert.equal(s.detail(a.id).assertions.filter(x=>x.property==='Nacimiento').length,2);
  }finally{s.close();}
});
test('disk persistence and bootstrap do not duplicate user records on restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'entre-ramas-persist-'));const file=join(dir,'family.sqlite');let s=new Store(file);
  const a=s.tx(()=>person(s));s.close();s=new Store(file);assert.equal(s.person(a.id).name,a.name);s.close();
  const {store}=fixture();try{bootstrap(store,join(process.cwd(),'data'));const before=store.stats();bootstrap(store,join(process.cwd(),'data'));assert.deepEqual(store.stats(),before);assert.equal(before.people,25);assert.equal(before.relationships,24);assert.equal(store.all<ImportRecord>('SELECT * FROM importRecords').length,439);}finally{store.close();}
});
test('API validates inputs, retries concurrent requests once, and blocks foreign origins',async()=>{
  const {store:s,dir}=fixture();const app=await buildApp(s,dir);try{
    const key=randomUUID();const request={method:'POST' as const,url:'/api/people',headers:{'idempotency-key':key},payload:{name:'Prueba API'}};
    const responses=await Promise.all([app.inject(request),app.inject(request)]);assert.equal(responses[0].statusCode,200);assert.equal(responses[1].json().id,responses[0].json().id);assert.equal(s.stats().people,1);
    const list=await app.inject('/api/people?query=prueba');assert.equal(list.statusCode,200);assert.equal(list.json().total,1);
    assert.equal((await app.inject({...request,headers:{'idempotency-key':randomUUID()},payload:{name:''}})).statusCode,400);
    assert.equal((await app.inject({url:'/api/stats',headers:{origin:'https://untrusted.example'}})).statusCode,403);
    assert.equal((await app.inject({url:'/api/stats',headers:{host:'untrusted.example'}})).statusCode,403);
    const p=responses[0].json();const edited=await app.inject({method:'PATCH',url:`/api/people/${p.id}`,headers:{'idempotency-key':randomUUID()},payload:{name:'Nombre nuevo',version:1}});assert.equal(edited.statusCode,200);
    const old=await app.inject({method:'PATCH',url:`/api/people/${p.id}`,headers:{'idempotency-key':randomUUID()},payload:{name:'Edición antigua',version:1}});assert.equal(old.statusCode,409);
    assert.equal((await app.inject('/api/export')).json().people[0].id,p.id);
  }finally{await app.close();s.close();}
});

test('API import preserves BOM bytes, returns the same batch on reupload and retains citations',async()=>{
  const {store:s,dir}=fixture();const app=await buildApp(s,dir);try{
    const bytes=Buffer.from('\ufeff"ANA SUAREZ","Fuente de prueba","","","","","","",""\r\n');
    const payload={name:'source.csv',base64:bytes.toString('base64')};
    const first=await app.inject({method:'POST',url:'/api/imports/preview',headers:{'idempotency-key':randomUUID()},payload});assert.equal(first.statusCode,200);
    const second=await app.inject({method:'POST',url:'/api/imports/preview',headers:{'idempotency-key':randomUUID()},payload});assert.equal(second.json().id,first.json().id);
    const saved=s.one<{path:string;id:string}>('SELECT * FROM sources')!;assert.deepEqual(readFileSync(join(dir,saved.path)),bytes);
    const download=await app.inject(`/api/sources/${saved.id}/content`);assert.equal(download.statusCode,200);assert.deepEqual(download.rawPayload,bytes);
    const batch=first.json();const applied=await app.inject({method:'POST',url:`/api/imports/${batch.id}/apply`,headers:{'idempotency-key':randomUUID()},payload:{}});assert.equal(applied.statusCode,200);assert.equal(applied.json().added,1);
    const p=s.people().items[0],q=s.tx(()=>person(s,'Otra persona'));const r=s.tx(()=>parent(s,p,q));
    s.tx(()=>s.addRelationship({...r,evidence:'Segunda fuente independiente'}));
    const citations=await app.inject(`/api/relationships/${r.id}/evidence`);assert.equal(citations.json().length,2);
    const bad=await app.inject({method:'POST',url:'/api/imports/preview',headers:{'idempotency-key':randomUUID()},payload:{name:'bad.csv',base64:Buffer.from([0xff,0xff]).toString('base64')}});assert.equal(bad.statusCode,400);
  }finally{await app.close();s.close();}
});
