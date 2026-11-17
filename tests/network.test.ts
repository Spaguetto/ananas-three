import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../apps/api/src/store';
import {NetworkStore} from '../apps/api/src/network';
import {buildApp} from '../apps/api/src/app';
import {nodeInput,connectionInput} from '../packages/contracts/network';
const person=(s:Store,name:string)=>s.createPerson({name,summary:'',lifeStatus:'unknown'});
const entity=(n:NetworkStore,kind:'union'|'place'|'event'|'group',label:string)=>n.save(nodeInput.parse({kind,label}));
const connect=(n:NetworkStore,sourceId:string,targetId:string,type:string)=>n.link(connectionInput.parse({sourceId,targetId,type,evidence:'Dato ficticio de prueba'}));

test('one identity participates in multiple unions and shared places without inferring parenthood',()=>{
  const s=new Store(':memory:');const n=new NetworkStore(s);try{
    const a=person(s,'Persona A'),b=person(s,'Persona B'),c=person(s,'Persona C'),child=person(s,'Descendiente');
    const first=entity(n,'union','Primer matrimonio'),second=entity(n,'union','Segundo matrimonio'),place=entity(n,'place','Lugar compartido');
    connect(n,a.id,first.id,'spouse');connect(n,b.id,first.id,'spouse');connect(n,a.id,second.id,'spouse');connect(n,c.id,second.id,'spouse');connect(n,child.id,first.id,'union_child');connect(n,a.id,place.id,'origin');connect(n,c.id,place.id,'origin');
    const graph=n.around(a.id,3,true,true);assert.equal(graph.people.length,4);assert.equal(new Set(graph.people.map(p=>p.id)).size,4);assert.equal(graph.entities.length,3);assert.equal(graph.relationships.length,0);assert.equal(graph.connections.length,7);
    assert.equal(n.personContexts(a.id).length,3);assert.equal(n.detail(first.id).connections.length,3);
    assert.equal(s.stats().connections,7);assert.equal(s.stats().unlinked,0);
    assert.throws(()=>connect(n,a.id,first.id,'union_child'),/cónyuge y descendiente/);
    assert.throws(()=>connect(n,a.id,place.id,'spouse'),/no es válido/);
    assert.throws(()=>connect(n,first.id,a.id,'spouse'),/no es válido/);
    assert.equal(n.around(a.id,1,false,true).connections.length,0);
    assert.equal(n.around(a.id,3,true,false).entities.length,2);
    s.updatePerson(a.id,{...a,name:'Nombre revisado',version:a.version});assert.equal(n.node(a.id).label,'Nombre revisado');
    assert.equal(s.all('PRAGMA foreign_key_check').length,0);
  }finally{s.close();}
});

test('API creates a union atomically, replays safely, preserves evidence and detects stale edits',async()=>{
  const s=new Store(':memory:');const n=new NetworkStore(s);const app=await buildApp(s,mkdtempSync(join(tmpdir(),'network-')));
  const a=person(s,'Persona A'),b=person(s,'Persona B');
  const send=(method:'POST'|'PATCH',url:string,payload:object,key=randomUUID())=>app.inject({method,url,headers:{'idempotency-key':key},payload});
  try{
    const body={kind:'union',label:'Matrimonio de prueba',date:'hacia 1970',endDate:'1982',unionState:'divorced',connections:[{sourceId:a.id,type:'spouse'},{sourceId:b.id,type:'spouse'}]};const key=randomUUID();
    const first=await send('POST','/api/entities',body,key);assert.equal(first.statusCode,200,first.body);const u=first.json();
    assert.equal((await send('POST','/api/entities',body,key)).json().id,u.id);assert.equal(n.entities().length,1);assert.equal(n.connections().length,2);
    assert.equal((await send('POST','/api/entities',{...body,label:'Otro matrimonio'},key)).statusCode,409);
    const bad=await send('POST','/api/entities',{...body,connections:[{sourceId:a.id,type:'spouse'},{sourceId:a.id,type:'union_child'}]});assert.equal(bad.statusCode,409);assert.equal(n.entities().length,1);assert.equal(n.connections().length,2);
    const payload={sourceId:a.id,targetId:u.id,type:'spouse',evidence:'Documento segundo'};
    const citation=(await send('POST','/api/connections',payload)).json();assert.equal(citation.citations.length,1);assert.equal((await send('POST','/api/connections',payload)).json().id,citation.id);assert.equal(n.connections().length,2);
    assert.equal((await send('PATCH',`/api/entities/${u.id}`,{...u,label:'Unión corregida',version:1})).statusCode,200);
    assert.equal((await send('PATCH',`/api/entities/${u.id}`,{...u,version:1})).statusCode,409);
    assert.equal((await send('PATCH',`/api/entities/${a.id}`,{...u,version:1})).statusCode,400);
    const archived=await send('PATCH',`/api/connections/${citation.id}`,{version:1,status:'rejected'});assert.equal(archived.statusCode,200);assert.equal(n.personContexts(a.id).length,0);
    assert.equal((await send('PATCH',`/api/connections/${citation.id}`,{version:1,status:'pending'})).statusCode,409);
    assert.equal((await send('PATCH',`/api/connections/${citation.id}`,{version:2,status:'pending'})).statusCode,200);
    const ex=(await app.inject('/api/export')).json();assert.equal(ex.version,4);assert.equal(ex.entities[0].unionState,'divorced');assert.equal(ex.connections.length,2);assert.equal(ex.people.length,2);assert.ok(ex.audit.some((x:{action:string})=>x.action==='node.updated'));
    const result=await app.inject(`/api/network/${a.id}?depth=2&includePending=true&context=true`);assert.equal(result.statusCode,200);assert.equal(result.json().people.length,2);assert.equal(result.json().entities.length,1);
    assert.equal((await app.inject(`/api/network/${a.id}?depth=20`)).statusCode,400);
  }finally{await app.close();s.close();}
});

test('shared nodes support non-tree cycles, bounded traversal and discard/restore',()=>{
  const s=new Store(':memory:');const n=new NetworkStore(s);try{
    const a=person(s,'Persona A'),b=person(s,'Persona B');const place=entity(n,'place','Lugar compartido'),event=entity(n,'event','Encuentro'),group=entity(n,'group','Grupo familiar');
    connect(n,a.id,event.id,'participant');connect(n,b.id,event.id,'participant');connect(n,event.id,place.id,'located_at');connect(n,a.id,place.id,'residence');connect(n,a.id,group.id,'member');connect(n,b.id,group.id,'member');
    assert.equal(n.around(a.id,5,true,true).people.length,2);assert.equal(n.around(a.id,5,true,true).entities.length,3);
    const archive=n.save(nodeInput.parse({...place,status:'rejected'}),place.id,place.version);assert.equal(n.around(a.id,5,true,true).entities.length,2);assert.throws(()=>connect(n,b.id,place.id,'origin'),/Restaura/);
    n.save(nodeInput.parse({...archive,status:'pending'}),place.id,archive.version);assert.equal(n.around(a.id,5,true,true).entities.length,3);
    for(let i=0;i<105;i++)connect(n,person(s,`Persona ${i}`).id,group.id,'member');
    const graph=n.around(group.id,5,true,true);assert.equal(graph.people.length+graph.entities.length,100);assert.equal(graph.truncated,true);
  }finally{s.close();}
});

test('reopening SQLite preserves the network, its citations and original person identity',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'network-disk-')),'family.sqlite');let s=new Store(path);let n=new NetworkStore(s);
  const p=person(s,'Identidad persistente'),u=entity(n,'union','Unión persistente');const link=connect(n,p.id,u.id,'spouse');s.close();s=new Store(path);n=new NetworkStore(s);
  try{assert.equal(n.node(p.id).id,p.id);assert.equal(n.detail(u.id).connections[0].id,link.id);assert.deepEqual(n.connections()[0].citations,link.citations);assert.equal(n.around(p.id,2,true,true).entities[0].id,u.id);assert.equal(s.all('PRAGMA foreign_key_check').length,0);}finally{s.close();}
});
