import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../apps/api/src/store';
import {buildApp} from '../apps/api/src/app';
import type {RelationshipEvidence} from '../packages/contracts/evidence';

const png='iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAmElEQVR4nO3PMQ2AUBTFUKwhBxHM6EIFdjDw38BUmjS5Y4d7tue+ltvPY7m/9dvfDgWgDwWgDwWgD30GWI5OfQC6D0D3AejeD7AcnfoAdB+A7gPQvR9gOTr1Aeg+AN0HoHs/wHJ06gPQfQC6D0D3foDl6NQHoPsAdB+A7v0Ay9GpD0D3Aeg+AN37AZajUx+A7gPQfQC61wNedxQxh/mpWPMAAAAASUVORK5CYII=';
async function fixture(){
  const root=mkdtempSync(join(tmpdir(),'family-evidence-')),s=new Store(join(root,'family.sqlite')),app=await buildApp(s,root);
  const people=['Persona A','Persona B','Persona C'].map(name=>s.createPerson({name,summary:'',lifeStatus:'unknown'}));
  return {root,s,app,people,close:async()=>{await app.close();s.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'family-evidence-'));rmSync(root,{recursive:true,force:true});}};
}
const headers=()=>({'idempotency-key':randomUUID()});

test('relationship creation stores text and original files, retries do not duplicate them, export includes attachments',async()=>{
  const f=await fixture();const {s,app,root,people:[a,b]}=f;
  try{
    const note=Buffer.from('Transcripción de prueba\r\nCon acentos: María.');
    const payload={sourceId:a.id,targetId:b.id,type:'parent',evidence:'Dos documentos por revisar',files:[{name:'Fotografía.png',base64:png},{name:'Nota.txt',base64:note.toString('base64')}]};
    const request={method:'POST' as const,url:'/api/relationships',headers:headers(),payload};
    const first=await app.inject(request);assert.equal(first.statusCode,200,first.body);const relation=first.json();assert.equal(relation.status,'pending');
    assert.deepEqual((await app.inject(request)).json(),relation);
    assert.equal((await app.inject({...request,headers:headers()})).json().id,relation.id);
    const citations=(await app.inject(`/api/relationships/${relation.id}/evidence`)).json<RelationshipEvidence[]>();
    assert.equal(citations.length,1);assert.equal(citations[0].files.length,2);assert.equal(s.all('SELECT * FROM sources').length,2);
    for(const file of citations[0].files){
      const original=file.mime==='image/png'?Buffer.from(png,'base64'):note;
      const saved=s.one<{path:string}>('SELECT path FROM sources WHERE id=?',file.id)!;
      assert.deepEqual(readFileSync(join(root,saved.path)),original);
      const response=await app.inject(`/api/sources/${file.id}/content?download=1&name=${encodeURIComponent(file.name)}`);
      assert.deepEqual(response.rawPayload,original);assert.match(String(response.headers['content-disposition']),/^attachment;/);
      assert.equal(response.headers['x-content-type-options'],'nosniff');
    }
    const exportData=(await app.inject('/api/export')).json();assert.equal(exportData.version,4);assert.equal(exportData.evidenceFiles.length,2);
    const reopened=new Store(join(root,'family.sqlite'));try{assert.equal(reopened.all('SELECT * FROM relationshipEvidenceFiles').length,2);assert.equal(reopened.person(a.id).name,a.name);}finally{reopened.close();}
  }finally{await f.close();}
});

test('new evidence preserves prior citations and review status; identical bytes are shared across notes',async()=>{
  const f=await fixture();const {s,app,people:[a,b]}=f;
  try{
    const relation=s.addRelationship({sourceId:a.id,targetId:b.id,type:'partner',status:'supported',context:'',evidence:'Testimonio original'});
    const url=`/api/relationships/${relation.id}/evidence`,file={name:'Acta.png',base64:png};
    const first=await app.inject({method:'POST',url,headers:headers(),payload:{files:[file]}});assert.equal(first.statusCode,200,first.body);
    const second=await app.inject({method:'POST',url,headers:headers(),payload:{evidence:'Otra interpretación de la misma acta',files:[{...file,name:'Copia.png'}]}});assert.equal(second.statusCode,200);
    const citations=second.json<RelationshipEvidence[]>();assert.equal(citations.length,3);assert.equal(citations[0].text,'Testimonio original');
    assert.equal(citations[1].files[0].id,citations[2].files[0].id);assert.equal(citations[2].files[0].name,'Copia.png');assert.equal(s.all('SELECT * FROM sources').length,1);
    assert.deepEqual(s.one('SELECT * FROM relationships WHERE id=?',relation.id),relation);
    const note=await app.inject({method:'POST',url,headers:headers(),payload:{evidence:'Nota adicional sin archivo'}});assert.equal(note.statusCode,200);assert.equal(note.json().length,4);
  }finally{await f.close();}
});

test('invalid uploads and impossible relationships leave no partial records or files',async()=>{
  const f=await fixture();const {s,app,root,people:[a,b]}=f;
  try{
    const payload={sourceId:a.id,targetId:b.id,type:'parent'};
    const submit=(extra:object)=>app.inject({method:'POST',url:'/api/relationships',headers:headers(),payload:{...payload,...extra}});
    assert.equal((await submit({})).statusCode,400);
    assert.equal((await submit({files:[{name:'Bad.png',base64:'bad!'}]})).statusCode,400);
    assert.equal((await submit({files:[{name:'Empty.txt',base64:''}]})).statusCode,400);
    assert.equal((await submit({files:[{name:'Too large.bin',base64:Buffer.alloc(10*1024*1024+1).toString('base64')}]})).statusCode,400);
    const large=Buffer.alloc(8.5*1024*1024).toString('base64');
    assert.equal((await submit({files:[1,2,3].map(i=>({name:`File ${i}`,base64:large}))})).statusCode,400);
    assert.equal(s.all('SELECT * FROM relationships').length,0);assert.equal(s.all('SELECT * FROM sources').length,0);
    assert.equal((await app.inject({method:'POST',url:`/api/relationships/${randomUUID()}/evidence`,headers:headers(),payload:{files:[{name:'Acta.png',base64:png}]}})).statusCode,404);
    s.addRelationship({...payload,status:'pending',context:'',evidence:'Nota original',type:'parent'});
    const cycle=await submit({sourceId:b.id,targetId:a.id,files:[{name:'Acta.png',base64:png}]});assert.equal(cycle.statusCode,409);
    assert.equal(s.all('SELECT * FROM sources').length,0);assert.equal(s.all('SELECT * FROM relationshipEvidence').length,1);assert.equal(existsSync(join(root,'originals')),false);
  }finally{await f.close();}
});

test('unknown files are downloaded, client filename cannot choose storage path or executable MIME',async()=>{
  const f=await fixture();const {s,app,people:[a,b]}=f;
  try{
    const content=Buffer.from('<html><script>alert(1)</script></html>');
    const response=await app.inject({method:'POST',url:'/api/relationships',headers:headers(),payload:{sourceId:a.id,targetId:b.id,type:'close',files:[{name:'../../falsa.png',base64:content.toString('base64')}]}});assert.equal(response.statusCode,200,response.body);
    const source=s.one<{id:string;path:string;mime:string;name:string}>('SELECT * FROM sources')!;
    assert.match(source.path,/^originals\/[a-f0-9]{64}\/original$/);assert.equal(source.name,'falsa.png');assert.equal(source.mime,'application/octet-stream');
    const result=await app.inject(`/api/sources/${source.id}/content`);assert.match(String(result.headers['content-disposition']),/^attachment;/);assert.equal(result.headers['content-type'],'application/octet-stream');assert.deepEqual(result.rawPayload,content);
  }finally{await f.close();}
});
