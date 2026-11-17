import type {NetworkData,GraphConnection} from '../../../packages/contracts/network';

/** A read-only view: one union, its participants' parents, children, children's
 * partners and grandchildren. Never expand through siblings or grandparents. */
export function familyBranch(graph:NetworkData,unionId:string,includeParents=true):NetworkData{
  const union=graph.entities.find(n=>n.id===unionId&&n.kind==='union');
  if(!union)return {people:[],entities:[],relationships:[],connections:[],truncated:false};
  const unions=new Set(graph.entities.filter(n=>n.kind==='union').map(n=>n.id));
  const members=new Map<string,GraphConnection[]>();
  for(const link of graph.connections){
    if(!unions.has(link.targetId)||!['spouse','union_child'].includes(link.type))continue;
    const list=members.get(link.targetId)??[];list.push(link);members.set(link.targetId,list);
  }
  const at=(id:string,type:string)=>(members.get(id)??[]).filter(c=>c.type===type).map(c=>c.sourceId);
  const couple=new Set(at(unionId,'spouse'));
  const children=new Set(at(unionId,'union_child'));
  const people=new Set([...couple,...children]);
  const selectedUnions=new Set([unionId]);
  const parents=graph.relationships.filter(r=>r.type==='parent');
  if(includeParents){
    for(const r of parents)if(couple.has(r.targetId))people.add(r.sourceId);
    // Include only the parents of the central couple, not their other unions.
    for(const id of unions){
      const partners=at(id,'spouse');
      if(at(id,'union_child').some(p=>couple.has(p))&&partners.length&&partners.every(p=>people.has(p)&&!couple.has(p)&&!children.has(p)))selectedUnions.add(id);
    }
  }
  // Expand through the children once. Partners are displayed but never traversed.
  for(const r of parents)if(children.has(r.sourceId))people.add(r.targetId);
  for(const id of unions){
    if(!at(id,'spouse').some(p=>children.has(p)))continue;
    selectedUnions.add(id);
    for(const link of members.get(id)??[])people.add(link.sourceId);
  }
  for(const r of graph.relationships)if(r.type==='partner'){
    if(children.has(r.sourceId))people.add(r.targetId);
    if(children.has(r.targetId))people.add(r.sourceId);
  }
  const connections=graph.connections.filter(c=>people.has(c.sourceId)&&selectedUnions.has(c.targetId)&&['spouse','union_child'].includes(c.type));
  // A union already draws the same connection. Hide redundant lines in this
  // projection only; all original relationships and evidence remain in the model.
  const represented=new Set<string>();
  for(const id of selectedUnions){
    const partners=at(id,'spouse'),kids=at(id,'union_child');
    for(const a of partners){
      for(const b of partners)represented.add(`partner:${a}:${b}`);
      for(const child of kids)represented.add(`parent:${a}:${child}`);
    }
  }
  return {
    people:graph.people.filter(p=>people.has(p.id)),
    entities:graph.entities.filter(n=>selectedUnions.has(n.id)),
    relationships:graph.relationships.filter(r=>['parent','partner'].includes(r.type)&&people.has(r.sourceId)&&people.has(r.targetId)&&!represented.has(`${r.type}:${r.sourceId}:${r.targetId}`)),
    connections,truncated:graph.truncated,
  };
}
