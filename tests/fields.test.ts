import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../apps/api/src/store';
import {buildApp} from '../apps/api/src/app';
import {fieldInput,type FieldInput,type PersonField} from '../packages/contracts';
import {applyBatch,bootstrap,getBatch,suggestedName} from '../apps/api/src/importer';
const newPerson=(s:Store,name='Persona de prueba')=>s.createPerson({name,summary:'',lifeStatus:'unknown'});
const input=(overrides:Partial<FieldInput>={})=>fieldInput.parse({label:'Campo propio',section:'Personal',type:'text',value:'Un dato',...overrides});

test('typed values distinguish false, zero and unknown; invalid dates/options/JSON cannot be saved',()=>{
  const s=new Store(':memory:');try{
    const p=newPerson(s);
    const values:Partial<FieldInput>[]=[{type:'boolean',value:false},{type:'boolean',value:null},{type:'number',value:0},{type:'number',value:-2.5},{type:'date',value:'2024-02-29'},{type:'list',value:['Uno','Dos']},{type:'json',value:{anidado:{lista:[false,0,null,'á']}}},{type:'select',options:['No se sabe','Otro'],value:'No se sabe'},{type:'longtext',value:'Relato\ncon saltos'}];
    for(const v of values){const f=s.tx(()=>s.saveField(p.id,input(v)));assert.deepEqual(f.value,v.value);}
    for(const invalid of [{type:'boolean',value:'false'},{type:'number',value:''},{type:'date',value:'2025-02-29'},{type:'date',value:'2025-04-31'},{type:'select',options:['Sí','No'],value:'Tal vez'},{type:'list',value:[1,2]},{type:'json',value:'texto'},{type:'json',value:{huge:'x'.repeat(60001)}},{observedAt:'2025-02-30'}])assert.equal(fieldInput.safeParse({...input(),...invalid}).success,false);
    assert.equal(s.detail(p.id).fields.length,values.length);
  }finally{s.close();}
});

test('field lifecycle is idempotent, scoped to one identity, conflict-safe and exportable with history',async()=>{
  const s=new Store(':memory:');const app=await buildApp(s,mkdtempSync(join(tmpdir(),'fields-api-')));
  try{
    const a=newPerson(s,'Prueba A'),b=newPerson(s,'Prueba B');
    const payload=input({label:'¿Hay información de salud?',section:'Salud',type:'boolean',value:null,sensitive:true});
    const create={method:'POST' as const,url:`/api/people/${a.id}/fields`,headers:{'idempotency-key':randomUUID()},payload};
    const [first,replay]=await Promise.all([app.inject(create),app.inject(create)]);assert.equal(first.statusCode,200);const f=first.json<PersonField>();assert.equal(replay.json().id,f.id);assert.equal(s.fields(a.id).length,1);assert.equal(s.fields(b.id).length,0);
    const patch=async(personId:string,data:unknown)=>app.inject({method:'PATCH',url:`/api/people/${personId}/fields/${f.id}`,headers:{'idempotency-key':randomUUID()},payload:data as object});
    assert.equal((await patch(b.id,{...payload,version:1})).statusCode,404);
    assert.equal((await patch(a.id,{...payload,value:'invalid',version:1})).statusCode,400);
    const edit=await patch(a.id,{...payload,label:'Pregunta actualizada',section:'Notas privadas',type:'text',value:'Sin información',version:1});assert.equal(edit.statusCode,200);assert.equal(edit.json().id,f.id);assert.equal(edit.json().version,2);
    assert.equal((await patch(a.id,{...payload,version:1})).statusCode,409);
    const archive=await app.inject({method:'PATCH',url:`/api/people/${a.id}/fields/${f.id}/archive`,headers:{'idempotency-key':randomUUID()},payload:{version:2,archived:true}});assert.equal(archive.statusCode,200);assert.equal(s.fields(a.id).length,0);assert.equal(s.fields(a.id,true).length,1);
    assert.equal((await patch(a.id,{...payload,version:3})).statusCode,409);
    const restore=await app.inject({method:'PATCH',url:`/api/people/${a.id}/fields/${f.id}/archive`,headers:{'idempotency-key':randomUUID()},payload:{version:3,archived:false}});assert.equal(restore.statusCode,200);assert.equal(s.fields(a.id)[0].value,'Sin información');
    const exported=(await app.inject('/api/export')).json();assert.equal(exported.version,4);assert.equal(exported.fields[0].sensitive,true);assert.equal(exported.fields[0].id,f.id);assert.deepEqual(exported.audit.filter((x:{entityId:string})=>x.entityId===f.id).map((x:{action:string})=>x.action),['field.created','field.updated','field.archived','field.restored']);
    assert.equal(JSON.parse(exported.audit.find((x:{action:string})=>x.action==='field.updated').beforeValue).value,null);
  }finally{await app.close();s.close();}
});

test('migrating and reopening a database preserves person IDs, original assertions and structured fields',()=>{
  const file=join(mkdtempSync(join(tmpdir(),'fields-disk-')),'family.sqlite');let s=new Store(file);
  const p=newPerson(s);const original=s.addAssertion({personId:p.id,property:'Registro original',value:'Texto íntegro',evidence:'Archivo original',status:'pending'});
  const f=s.tx(()=>s.saveField(p.id,input({type:'json',value:{preferencias:['lectura','jardín'],activo:false}})));
  s.close();s=new Store(file);
  try{assert.equal(s.person(p.id).id,p.id);assert.equal(s.detail(p.id).assertions[0].id,original.id);assert.deepEqual(s.fields(p.id)[0].value,f.value);assert.equal(s.all('SELECT * FROM schema_migrations').length,4);}finally{s.close();}
});

test('full supplied batch expands the starter collection without fabricated identities or duplicate replays',()=>{
  const s=new Store(':memory:');try{
    bootstrap(s,join(process.cwd(),'data'));const batch=s.one<{id:string}>('SELECT id FROM imports')!;
    const old=s.people().items[0];s.updatePerson(old.id,{...old,name:'Nombre revisado por la familia',version:old.version});
    const result=s.tx(()=>applyBatch(s,batch.id));assert.ok(result.added>250);assert.ok(result.remaining>100);assert.equal(s.person(old.id).name,'Nombre revisado por la familia');assert.equal(s.stats().relationships,24);
    const records=getBatch(s,batch.id,true).records!;
    for(const row of [4,10,66,137,325,367,400,402])assert.equal(records.find(r=>r.row===row)!.personId,null,`Ambiguous row ${row} must remain unlinked`);
    assert.equal(suggestedName('Olga Maria Lázaro Melo Agosto 21 1919'),'Olga Maria Lázaro Melo');assert.equal(suggestedName('EDGAR CIFUENTES BOGOTÁ'),'Edgar Cifuentes');
    assert.equal(suggestedName('Julio Lázaro Chaustre Ocaña'),'Julio Lázaro Chaustre');assert.equal(suggestedName('Carlos Julio Jacome Roca 1909'),'Carlos Julio Jacome Roca');
    for(const row of [116,120,246,247])assert.ok(records.find(r=>r.row===row)!.personId,`Julio is a given name in row ${row}`);
    assert.ok(records.find(r=>r.row===439)!.personId);assert.equal(s.tx(()=>applyBatch(s,batch.id)).added,0);assert.equal(s.stats().candidates,0);
    assert.ok(s.all<{status:string}>('SELECT status FROM people').every(x=>x.status==='pending'));
  }finally{s.close();}
});
