import {randomUUID} from 'node:crypto';
import {Store,DomainError} from './store';
import {allowedConnections,nodeInput,connectionInput,type EntityInput,type EntityDetail,type NodeKind,type GraphEntity,type GraphConnection,type ConnectionInput,type NetworkData} from '../../../packages/contracts/network';
import type {Person,Relationship,ReviewStatus} from '../../../packages/contracts';

export class NetworkStore{
  constructor(private store:Store){}
  node(id:string){const n=this.store.one<Omit<GraphEntity,'kind'>&{kind:NodeKind}>('SELECT * FROM graphNodes WHERE id=?',id);if(!n)throw new DomainError(404,'No se encontró el nodo.');return n;}
  entities(kind?:string){return this.store.all<GraphEntity>(`SELECT * FROM graphNodes WHERE kind!='person' ${kind?'AND kind=?':''} ORDER BY label,id`,...(kind?[kind]:[]));}
  connections(){return this.store.all<GraphConnection>('SELECT * FROM graphConnections ORDER BY id').map(c=>({...c,citations:this.store.all<{text:string}>('SELECT text FROM graphCitations WHERE connectionId=? ORDER BY rowid',c.id).map(x=>x.text)}));}
  detail(id:string):EntityDetail{const node=this.node(id);if(node.kind==='person')throw new DomainError(400,'Abre esta identidad desde Personas.');return {...node,kind:node.kind,connections:this.connections().filter(c=>c.sourceId===id||c.targetId===id).map(c=>{const other=this.node(c.sourceId===id?c.targetId:c.sourceId);return {...c,other:{id:other.id,kind:other.kind,label:other.label}};})};}
  save(input:EntityInput,id?:string,version?:number){
    const data=nodeInput.parse(input);const previous=id?this.node(id):null;
    if(previous&&(previous.kind==='person'||previous.kind!==data.kind))throw new DomainError(400,'El tipo del nodo no se puede cambiar.');
    if(previous&&previous.version!==version)throw new DomainError(409,'El nodo cambió. Actualiza la vista antes de guardar.');
    const nid=id??randomUUID();const values=[data.label,data.description,data.date,data.endDate,data.category,data.unionState,data.evidence,data.status];
    if(previous)this.store.run('UPDATE graphNodes SET label=?,description=?,date=?,endDate=?,category=?,unionState=?,evidence=?,status=?,version=version+1 WHERE id=?',...values,nid);
    else this.store.run('INSERT INTO graphNodes(label,description,date,endDate,category,unionState,evidence,status,id,kind) VALUES(?,?,?,?,?,?,?,?,?,?)',...values,nid,data.kind);
    const result=this.node(nid);this.store.audit(previous?'node.updated':'node.created',nid,previous,result);return result;
  }
  link(input:ConnectionInput){
    const data=connectionInput.parse(input);const source=this.node(data.sourceId),target=this.node(data.targetId);
    const [from,to]=allowedConnections[data.type];
    if(!from.includes(source.kind)||!to.includes(target.kind))throw new DomainError(400,'Este tipo de conexión no es válido entre los nodos elegidos.');
    if(source.status==='rejected'||target.status==='rejected')throw new DomainError(409,'Restaura el nodo descartado antes de conectarlo.');
    this.checkMembership(data);
    const previous=this.store.one<GraphConnection>('SELECT * FROM graphConnections WHERE sourceId=? AND targetId=? AND type=?',data.sourceId,data.targetId,data.type);
    if(previous){if(data.evidence){this.store.run('INSERT OR IGNORE INTO graphCitations(id,connectionId,text) VALUES(?,?,?)',randomUUID(),previous.id,data.evidence);this.store.audit('connection.cited',previous.id,null,{evidence:data.evidence});}return this.connections().find(c=>c.id===previous.id)!;}
    const id=randomUUID();this.store.run('INSERT INTO graphConnections(id,sourceId,targetId,type,status,evidence) VALUES(?,?,?,?,?,?)',id,data.sourceId,data.targetId,data.type,data.status,data.evidence);
    if(data.evidence)this.store.run('INSERT INTO graphCitations(id,connectionId,text) VALUES(?,?,?)',randomUUID(),id,data.evidence);
    const result=this.connections().find(c=>c.id===id)!;this.store.audit('connection.created',id,null,result);return result;
  }
  private checkMembership(data:ConnectionInput){
    if(data.status==='rejected'||!['spouse','union_child'].includes(data.type))return;
    const other=data.type==='spouse'?'union_child':'spouse';
    if(this.store.one("SELECT id FROM graphConnections WHERE sourceId=? AND targetId=? AND type=? AND status!='rejected'",data.sourceId,data.targetId,other))throw new DomainError(409,'Una persona no puede ser cónyuge y descendiente de la misma unión.');
  }
  reviewConnection(id:string,status:ReviewStatus,version:number){
    const before=this.connections().find(c=>c.id===id);if(!before)throw new DomainError(404,'No se encontró la conexión.');
    if(before.version!==version)throw new DomainError(409,'La conexión cambió. Actualiza la vista.');
    this.checkMembership({...before,status});
    if(status!=='rejected'&&(this.node(before.sourceId).status==='rejected'||this.node(before.targetId).status==='rejected'))throw new DomainError(409,'Restaura primero los nodos descartados.');
    this.store.run('UPDATE graphConnections SET status=?,version=version+1 WHERE id=?',status,id);const after=this.connections().find(c=>c.id===id)!;this.store.audit('connection.reviewed',id,before,after);return after;
  }
  around(id:string,depth:number,pending:boolean,context:boolean):NetworkData{
    const root=this.node(id);const allowed=(s:ReviewStatus)=>s==='supported'||(pending&&['pending','disputed'].includes(s));
    const entities=this.entities().filter(n=>allowed(n.status));const entityIds=new Set(entities.map(n=>n.id));
    if(root.kind!=='person')entityIds.add(id); // The explicitly selected node remains inspectable.
    const relations=this.store.all<Relationship>(`SELECT * FROM relationships WHERE ${context?'1=1':"type='parent'"} ORDER BY id`).filter(r=>allowed(r.status));
    const links=this.connections().filter(c=>allowed(c.status)&&(context||['spouse','union_child'].includes(c.type))).filter(c=>{const a=this.node(c.sourceId),b=this.node(c.targetId);return (a.kind==='person'||entityIds.has(a.id))&&(b.kind==='person'||entityIds.has(b.id));});
    const edges=[...relations,...links];const adjacent=new Map<string,Set<string>>();
    for(const c of edges){for(const [a,b] of [[c.sourceId,c.targetId],[c.targetId,c.sourceId]]){if(!adjacent.has(a))adjacent.set(a,new Set());adjacent.get(a)!.add(b);}}
    const ids=new Set([id]);let frontier=[id];let truncated=false;
    for(let n=0;n<depth;n++){const next:string[]=[];for(const a of frontier)for(const b of adjacent.get(a)??[]){if(ids.has(b))continue;if(ids.size>=100){truncated=true;continue;}ids.add(b);next.push(b);}frontier=next;}
    const nodes=[...ids].map(n=>this.node(n));
    return {people:nodes.filter(n=>n.kind==='person').map(n=>this.store.person(n.id)),entities:nodes.filter((n):n is GraphEntity=>n.kind!=='person'),relationships:relations.filter(c=>ids.has(c.sourceId)&&ids.has(c.targetId)),connections:links.filter(c=>ids.has(c.sourceId)&&ids.has(c.targetId)),truncated};
  }
  personContexts(id:string){this.store.person(id);return this.connections().filter(c=>c.sourceId===id&&c.status!=='rejected').map(c=>({...c,node:this.node(c.targetId)})).filter(c=>c.node.status!=='rejected');}
  overview(pending:boolean,context:boolean):NetworkData{
    const allowed=(s:ReviewStatus)=>s==='supported'||(pending&&['pending','disputed'].includes(s));
    const people=this.store.all<Person>("SELECT * FROM people WHERE status!='rejected' ORDER BY searchName,id");
    const entities=this.entities().filter(n=>allowed(n.status));
    const allIds=new Set([...people,...entities].map(n=>n.id));
    const relationships=this.store.all<Relationship>('SELECT * FROM relationships ORDER BY id').filter(r=>allowed(r.status)&&(context||r.type==='parent')&&allIds.has(r.sourceId)&&allIds.has(r.targetId));
    const connections=this.connections().filter(c=>allowed(c.status)&&(context||['spouse','union_child'].includes(c.type))&&allIds.has(c.sourceId)&&allIds.has(c.targetId));
    const adjacent=new Map([...allIds].map(id=>[id,new Set<string>()]));
    for(const e of [...relationships,...connections]){adjacent.get(e.sourceId)!.add(e.targetId);adjacent.get(e.targetId)!.add(e.sourceId);}
    const visited=new Set<string>();let components=0;
    for(const id of allIds){if(visited.has(id))continue;components++;const queue=[id];visited.add(id);for(let i=0;i<queue.length;i++)for(const next of adjacent.get(queue[i])!){if(!visited.has(next)){visited.add(next);queue.push(next);}}}
    // Isolated identities belong to the archive too; the overview is not a capped neighborhood.
    return {people,entities,relationships,connections,truncated:false,overview:{totalNodes:allIds.size,totalPeople:people.length,isolatedPeople:people.filter(p=>!adjacent.get(p.id)!.size).length,components}};
  }
}
