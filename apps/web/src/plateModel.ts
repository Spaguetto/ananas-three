import type {NetworkData} from '../../../packages/contracts/network';
import type {ReviewStatus} from '../../../packages/contracts';
import type {PlatePersonInfo} from '../../../packages/contracts/plates';
export interface PlateNode {id:string;kind:'person'|'union';label:string;status:ReviewStatus}
export interface PlateEdge {id:string;source:string;target:string;type:string;status:ReviewStatus}
export function plateGraph(graph:NetworkData,selected:Set<string>,other=false){
  const people=graph.people.filter(p=>selected.has(p.id)&&p.status!=='rejected');
  const ids=new Set(people.map(p=>p.id));
  const nodes:PlateNode[]=people.map(p=>({id:p.id,kind:'person',label:p.name,status:p.status}));
  const edges:PlateEdge[]=[];
  const represented=new Set<string>();
  for(const union of graph.entities.filter(n=>n.kind==='union'&&n.status!=='rejected')){
    const links=graph.connections.filter(c=>c.targetId===union.id&&ids.has(c.sourceId)&&c.status!=='rejected');
    const spouses=links.filter(c=>c.type==='spouse'),children=links.filter(c=>c.type==='union_child');
    if(spouses.length+children.length<2)continue;
    nodes.push({id:union.id,kind:'union',label:union.label,status:union.status});
    for(const c of [...spouses,...children])edges.push({id:c.id,source:c.type==='union_child'?union.id:c.sourceId,target:c.type==='union_child'?c.sourceId:union.id,type:c.type,status:c.status});
    for(const parent of spouses)for(const child of children)if(parent.status===child.status&&parent.status===union.status)represented.add(`${parent.sourceId}:${child.sourceId}:${parent.status}`);
  }
  for(const r of graph.relationships){
    if(!ids.has(r.sourceId)||!ids.has(r.targetId)||r.status==='rejected')continue;
    if(!other&&!['parent','partner'].includes(r.type))continue;
    if(r.type==='parent'&&represented.has(`${r.sourceId}:${r.targetId}:${r.status}`))continue;
    edges.push({id:r.id,source:r.sourceId,target:r.targetId,type:r.type,status:r.status});
  }
  return {nodes,edges};
}
export function suggestedDates(info:PlatePersonInfo){
  const format=(items:PlatePersonInfo['birth'],prefix:string)=>{
    const distinct=[...new Set(items.map(d=>d.value))];
    if(distinct.length>1||items.some(d=>d.status==='disputed'))return `${prefix} por revisar`;
    if(!distinct.length)return '';
    const value=distinct[0].replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
    return `${prefix} ${value}${items.every(d=>d.status==='supported')?'':' ?'}`;
  };
  return [format(info.birth,'n.'),format(info.death,'f.')].filter(Boolean).join(' · ');
}
