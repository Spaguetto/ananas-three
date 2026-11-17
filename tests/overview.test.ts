import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Store} from '../apps/api/src/store';
import {NetworkStore} from '../apps/api/src/network';
import {buildApp} from '../apps/api/src/app';
import {bootstrap,applyBatch} from '../apps/api/src/importer';
import {relationshipRecovery,applyRelationshipRecovery} from '../apps/api/src/recoverRelationships';
import {overviewLayout} from '../apps/web/src/overviewLayout';

test('overview includes every identity beyond 100, separates isolated nodes, and respects edge filters',async()=>{
  const s=new Store(':memory:');const n=new NetworkStore(s);const app=await buildApp(s,'data');try{
    const people=Array.from({length:289},(_,i)=>s.createPerson({name:`Persona ${i}`,summary:'',lifeStatus:'unknown'}));
    s.addRelationship({sourceId:people[0].id,targetId:people[1].id,type:'parent',context:'',evidence:'Prueba sintética',status:'pending'});
    s.addRelationship({sourceId:people[1].id,targetId:people[2].id,type:'close',context:'',evidence:'Prueba sintética',status:'supported'});
    const full=(await app.inject('/api/network')).json();assert.equal(full.people.length,289);assert.equal(full.relationships.length,2);assert.equal(full.overview.isolatedPeople,286);assert.equal(full.overview.components,287);assert.equal(full.truncated,false);
    assert.equal(n.overview(false,true).people.length,289);assert.equal(n.overview(false,true).overview!.isolatedPeople,287);
    assert.equal(n.overview(true,false).relationships.length,1);assert.equal(n.around(people[0].id,1,true,true).people.length,2);
    assert.equal((await app.inject('/api/network?includePending=maybe')).statusCode,400);
  }finally{await app.close();s.close();}
});

test('reviewed transcription recovery is additive and replay-safe, preserves review decisions and leaves ambiguities unresolved',async()=>{
  const s=new Store(':memory:');const app=await buildApp(s,'data');try{
    bootstrap(s,join(process.cwd(),'data'));const batch=s.one<{id:string}>('SELECT id FROM imports')!;s.tx(()=>applyBatch(s,batch.id));
    const beforePeople=s.all('SELECT * FROM people ORDER BY id'),beforeRelations=s.all('SELECT * FROM relationships ORDER BY id');
    const p=relationshipRecovery(s,batch.id);assert.equal(p.newCount,49);assert.ok(p.notes.some(n=>n.row===393));
    const request={method:'POST' as const,url:`/api/imports/${batch.id}/relationships/apply`,headers:{'idempotency-key':randomUUID()}};
    const first=await app.inject(request);assert.equal(first.statusCode,200,first.body);assert.equal(first.json().added,49);assert.deepEqual((await app.inject(request)).json(),first.json());
    const after=s.all<{id:string;status:string;sourceRow:number;version:number}>('SELECT * FROM relationships');assert.equal(after.length,73);
    assert.deepEqual(s.all('SELECT * FROM people ORDER BY id'),beforePeople);
    for(const r of beforeRelations as {id:string}[])assert.deepEqual(s.one('SELECT * FROM relationships WHERE id=?',r.id),r);
    const added=after.filter(r=>!(beforeRelations as {id:string}[]).some(b=>b.id===r.id));assert.equal(added.length,49);assert.ok(added.every(r=>r.status==='pending'));
    for(const r of added)assert.ok(s.one('SELECT id FROM relationshipEvidence WHERE relationshipId=? AND sourceId IS NOT NULL AND sourceRow=?',r.id,r.sourceRow));
    s.review('relationships',added[0].id,'rejected',added[0].version);assert.equal(s.tx(()=>applyRelationshipRecovery(s,batch.id)).added,0);assert.equal(s.one<{status:string}>('SELECT status FROM relationships WHERE id=?',added[0].id)!.status,'rejected');
    assert.equal(s.tx(()=>applyRelationshipRecovery(s,batch.id)).citationsAdded,0);assert.equal(s.all('PRAGMA foreign_key_check').length,0);
    assert.equal(s.one<{n:number}>('SELECT count(*) n FROM importRecords WHERE personId IS NULL AND classification=?','review')!.n,114);
  }finally{await app.close();s.close();}
});

test('overview packs separate branches and isolated identities without dropping or stacking their positions',async()=>{
  const ids=Array.from({length:289},(_,i)=>`person-${i}`),edges=[{source:ids[0],target:ids[1]},{source:ids[2],target:ids[3]}];
  const result=await overviewLayout(ids,edges,async part=>new Map(part.map((id,i)=>[id,{x:0,y:i*240}])));
  assert.equal(result.positions.size,289);assert.equal(new Set([...result.positions.values()].map(p=>`${p.x},${p.y}`)).size,289);assert.equal(result.labels.length,3);
  assert.ok(result.labels.some(l=>l.label.includes('285 fichas')));assert.ok([...result.positions.values()].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  const ordered=[...result.positions.values()];for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++)assert.ok(Math.abs(ordered[i].x-ordered[j].x)>=174||Math.abs(ordered[i].y-ordered[j].y)>=170);
});
