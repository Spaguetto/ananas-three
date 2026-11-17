import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../apps/api/src/store';
import {NetworkStore} from '../apps/api/src/network';
import {nodeInput,connectionInput} from '../packages/contracts/network';
import {familyBranch} from '../apps/web/src/familyBranch';

test('family view includes the couple, parents, children, partners and grandchildren, without expanding collateral branches',()=>{
  const s=new Store(':memory:'),n=new NetworkStore(s);
  try{
    const person=(name:string)=>s.createPerson({name,summary:'',lifeStatus:'unknown'}).id;
    const parent=(a:string,b:string)=>s.addRelationship({sourceId:a,targetId:b,type:'parent',context:'',evidence:'Fictional fixture',status:'pending'});
    const union=(label:string,pair:string[],kids:string[])=>{
      const u=n.save(nodeInput.parse({kind:'union',label}));
      for(const id of pair)n.link(connectionInput.parse({sourceId:id,targetId:u.id,type:'spouse'}));
      for(const id of kids){n.link(connectionInput.parse({sourceId:id,targetId:u.id,type:'union_child'}));for(const p of pair)parent(p,id);}
      if(pair.length===2)s.addRelationship({sourceId:pair[0],targetId:pair[1],type:'partner',context:'',evidence:'Fictional fixture',status:'pending'});
      return u.id;
    };
    const a=person('Principal A'),b=person('Principal B'),c=person('Child C'),d=person('Child D');
    const cp=person('Partner C'),dp=person('Partner D'),g1=person('Grandchild one'),g2=person('Grandchild two');
    const pa=person('Parent A1'),ma=person('Parent A2'),pb=person('Parent B1'),mb=person('Parent B2');
    const grandpa=person('Grandparent'),aunt=person('Sibling of principal'),cousin=person('Cousin'),inlaw=person('Parent of partner'),great=person('Great grandchild');
    const root=union('Central union',[a,b],[c,d]);union('Parents A',[pa,ma],[a,aunt]);union('Parents B',[pb,mb],[b]);
    union('Child union C',[c,cp],[]);union('Child union D',[d,dp],[g1,g2]);
    parent(grandpa,pa);parent(aunt,cousin);parent(inlaw,dp);parent(g1,great);
    const raw=n.overview(true,true),before=JSON.stringify(raw);
    const view=familyBranch(raw,root);
    assert.deepEqual(new Set(view.people.map(p=>p.id)),new Set([a,b,c,d,cp,dp,g1,g2,pa,ma,pb,mb]));
    assert.equal(view.entities.length,5);assert.equal(view.connections.length,16);
    assert.equal(view.relationships.length,0,'Union connections replace only redundant visual lines');
    assert.equal(JSON.stringify(raw),before,'Projection must not mutate the full model');
    const compact=familyBranch(raw,root,false);
    assert.equal(compact.people.length,8);assert.equal(compact.entities.length,3);
    assert.equal(familyBranch(raw,'missing').people.length,0);
    assert.equal(familyBranch(n.overview(false,true),root).people.length,0,'Pending filters must be respected');
    // An explicit single-parent edge must remain visible when no union represents it.
    const solo=person('Child without union');parent(c,solo);
    const extended=familyBranch(n.overview(true,true),root);
    assert.ok(extended.people.some(p=>p.id===solo));assert.ok(extended.relationships.some(r=>r.sourceId===c&&r.targetId===solo));
  }finally{s.close();}
});
