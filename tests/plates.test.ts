import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../apps/api/src/store';
import {NetworkStore} from '../apps/api/src/network';
import {buildApp} from '../apps/api/src/app';
import {nodeInput} from '../packages/contracts/network';
import {plateGraph,suggestedDates} from '../apps/web/src/plateModel';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';

test('plate metadata exposes explicit dates only and preserves conflicting versions',async()=>{
  const s=new Store(':memory:');const app=await buildApp(s,'data');
  try{
    const p=s.createPerson({name:'Persona de prueba',summary:'Nota privada',lifeStatus:'unknown'});
    s.saveField(p.id,{label:'Salud',section:'Salud',type:'text',value:'Dato médico privado',options:[],notes:'',source:'',observedAt:'',sensitive:false});
    s.saveField(p.id,{label:'Nacimiento',section:'Personal',type:'date',value:'1970-03-04',options:[],notes:'',source:'',observedAt:'',sensitive:true});
    for(const value of ['1910','1912'])s.addAssertion({personId:p.id,property:'Nacimiento',value,evidence:'Fuentes diferentes',status:'disputed'});
    const response=await app.inject({method:'POST',url:'/api/plates/people',payload:{ids:[p.id,p.id]}});
    assert.equal(response.statusCode,200);const data=response.json();assert.equal(data.length,1);assert.equal(data[0].birth.length,2);
    assert.ok(!response.body.includes('privad'));assert.ok(!response.body.includes('1970'));assert.equal(suggestedDates(data[0]),'n. por revisar');
    assert.equal((await app.inject({method:'POST',url:'/api/plates/people',payload:{ids:['bad']}})).statusCode,400);
  }finally{await app.close();s.close();}
});

test('plate uses one identity across multiple unions, keeps subsets and differing evidence states',()=>{
  const s=new Store(':memory:'),n=new NetworkStore(s);
  try{
    const persons=['Progenitor','Pareja A','Pareja B','Hijo A','Hija B'].map(name=>s.createPerson({name,summary:'',lifeStatus:'unknown'}));
    for(const [partner,child] of [[1,3],[2,4]]){
      const u=n.save(nodeInput.parse({kind:'union',label:'Unión '+partner}));
      for(const index of [0,partner])n.link({sourceId:persons[index].id,targetId:u.id,type:'spouse',status:'pending',evidence:'Prueba'});
      n.link({sourceId:persons[child].id,targetId:u.id,type:'union_child',status:'pending',evidence:'Prueba'});
      s.addRelationship({sourceId:persons[0].id,targetId:persons[child].id,type:'parent',status:child===3?'supported':'pending',context:'',evidence:'Prueba explícita'});
    }
    const all=n.overview(true,true),model=plateGraph(all,new Set(persons.map(p=>p.id)));
    assert.equal(model.nodes.filter(p=>p.kind==='person').length,5);assert.equal(model.nodes.filter(p=>p.id===persons[0].id).length,1);
    assert.equal(model.nodes.filter(p=>p.kind==='union').length,2);assert.equal(model.edges.filter(e=>e.type==='parent').length,1,'Different certainty must remain visible');
    const subset=plateGraph(all,new Set([persons[0].id,persons[3].id]));assert.ok(subset.nodes.every(p=>p.kind==='union'||[persons[0].id,persons[3].id].includes(p.id)));assert.equal(subset.nodes.filter(p=>p.kind==='union').length,1);
    assert.equal(s.all('SELECT * FROM relationships').length,2,'Printing must not synthesize parent records');
  }finally{s.close();}
});

test('date labels retain uncertainty and do not invent missing dates',()=>{
  assert.equal(suggestedDates({id:'x',birth:[],death:[],original:'Nombre 1920'}),'');
  assert.equal(suggestedDates({id:'x',birth:[{value:'1970-03-04',status:'pending',origin:'Campo'}],death:[],original:''}),'n. 04/03/1970 ?');
  assert.equal(suggestedDates({id:'x',birth:[],death:[{value:'2020',status:'supported',origin:'Acta'}],original:''}),'f. 2020');
});

test('PNG export persists identical bytes, replays safely and serves a download without path injection',async()=>{
  const root=mkdtempSync(join(tmpdir(),'family-plate-')),s=new Store(':memory:'),app=await buildApp(s,root);
  const base64='iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAmElEQVR4nO3PMQ2AUBTFUKwhBxHM6EIFdjDw38BUmjS5Y4d7tue+ltvPY7m/9dvfDgWgDwWgDwWgD30GWI5OfQC6D0D3AejeD7AcnfoAdB+A7gPQvR9gOTr1Aeg+AN0HoHs/wHJ06gPQfQC6D0D3foDl6NQHoPsAdB+A7v0Ay9GpD0D3Aeg+AN37AZajUx+A7gPQfQC61wNedxQxh/mpWPMAAAAASUVORK5CYII=';
  try{
    const request={method:'POST' as const,url:'/api/plates/export',headers:{'idempotency-key':randomUUID()},payload:{title:'Familia / prueba',base64}};
    const first=await app.inject(request);assert.equal(first.statusCode,200,first.body);const data=first.json();
    assert.deepEqual((await app.inject(request)).json(),data);assert.equal(s.all('SELECT * FROM audit').length,1);assert.equal(data.width,64);
    assert.deepEqual(readFileSync(join(root,data.path)),Buffer.from(base64,'base64'));
    const download=await app.inject(data.url+'?download=1&name=Familia.png');assert.equal(download.statusCode,200);assert.equal(download.headers['content-type'],'image/png');assert.match(String(download.headers['content-disposition']),/attachment/);assert.deepEqual(download.rawPayload,Buffer.from(base64,'base64'));
    const bad=await app.inject({...request,headers:{'idempotency-key':randomUUID()},payload:{title:'Invalid',base64:Buffer.alloc(60).toString('base64')}});assert.equal(bad.statusCode,400);assert.equal(s.all('SELECT * FROM audit').length,1);
    assert.equal((await app.inject('/api/plates/files/not-a-hash')).statusCode,400);
  }finally{await app.close();s.close();assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'family-plate-'));rmSync(root,{recursive:true,force:true});}
});
