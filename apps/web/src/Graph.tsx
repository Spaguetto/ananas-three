import {memo,useEffect,useState,useRef} from 'react';
import {ReactFlow,Handle,Position,Controls,MiniMap,MarkerType,ReactFlowProvider,useReactFlow,useNodesState,type Node,type Edge,type NodeProps} from '@xyflow/react';
import {Focus,Heart,MapPin,CalendarDays,Users} from 'lucide-react';
import {statusLabels,typeLabels,type ReviewStatus} from '../../../packages/contracts';
import {entityLabels,connectionLabels,type NodeKind,type NetworkData} from '../../../packages/contracts/network';
import type {ELK} from 'elkjs/lib/elk-api';
import {overviewLayout,type OverviewLabel} from './overviewLayout';
type SectionNode=Node<{label:string},'sectionLabel'>;
type InkNode=Node<{label:string;kind:NodeKind;root:boolean;status:ReviewStatus;onSelect:(id:string,kind:NodeKind)=>void},'ink'>;
const icons={union:Heart,place:MapPin,event:CalendarDays,group:Users};
const sides=[['t',Position.Top],['r',Position.Right],['b',Position.Bottom],['l',Position.Left]] as const;
const InkCircle=memo(({id,data:d}:NodeProps<InkNode>)=>{const Icon=d.kind==='person'?null:icons[d.kind];return <div className={`ink-node kind-${d.kind} ${d.root?'is-reference':''} review-${d.status}`}>
  {sides.flatMap(([side,position])=>['source','target'].map(type=><Handle key={`${side}-${type}`} type={type as 'source'|'target'} id={`${side}-${type}`} position={position} className={`ink-handle handle-${side}`}/>))}
  <button className="ink-person nodrag" aria-label={`Abrir ${d.kind==='person'?'persona':entityLabels[d.kind]}: ${d.label}`} onClick={()=>d.onSelect(id,d.kind)}><span className="ink-circle">{Icon?<Icon size={28} strokeWidth={1.4}/>:<span>{d.label.split(/\s+/).slice(0,2).map(s=>s[0]).join('')}</span>}</span><strong>{d.label}</strong><small>{d.kind==='person'?(d.root?'Punto de partida':statusLabels[d.status]):entityLabels[d.kind]}</small></button>
  </div>;});
const SectionLabel=memo(({data}:NodeProps<SectionNode>)=><div className="map-section-label">{data.label}</div>);
const nodeTypes={ink:InkCircle,sectionLabel:SectionLabel};
type Point={x:number;y:number};
type Segment={id:string;source:string;target:string;label:string;status:ReviewStatus;arrow:boolean;spiritual?:boolean};
function radial(ids:string[],edges:Segment[],root:string):Map<string,Point>{
  const levels=new Map([[root,0]]);let frontier=[root];for(let level=1;frontier.length&&level<=ids.length;level++){const next:string[]=[];for(const e of edges){const other=frontier.includes(e.source)?e.target:frontier.includes(e.target)?e.source:null;if(other&&!levels.has(other)){levels.set(other,level);next.push(other);}}frontier=next;}
  const points=new Map<string,Point>();const rings=new Map<number,string[]>();for(const id of ids){const level=levels.get(id)??1;if(!rings.has(level))rings.set(level,[]);rings.get(level)!.push(id);}
  for(const [level,ring] of rings){const radius=level?Math.max(level*240,ring.length*210/(2*Math.PI)):0;ring.forEach((id,i)=>{const a=-Math.PI/2+i*2*Math.PI/ring.length+level*.25;points.set(id,{x:radius*Math.cos(a),y:radius*Math.sin(a)});});}
  // Deterministic spring relaxation; the reference identity remains fixed at the center.
  for(let iteration=0;iteration<180;iteration++){
    const forces=new Map(ids.map(id=>[id,{x:0,y:0}]));
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=points.get(ids[i])!,b=points.get(ids[j])!;let dx=a.x-b.x,dy=a.y-b.y;const dist=Math.hypot(dx,dy)||1;if(dist<1){dx=1;dy=.5;}const strength=Math.min(25,9000/(dist*dist))+Math.max(0,185-dist)*.2;const f={x:dx/dist*strength,y:dy/dist*strength};forces.get(ids[i])!.x+=f.x;forces.get(ids[i])!.y+=f.y;forces.get(ids[j])!.x-=f.x;forces.get(ids[j])!.y-=f.y;}
    for(const e of edges){const a=points.get(e.source)!,b=points.get(e.target)!;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,s=(d-210)*.026;forces.get(e.source)!.x+=dx/d*s;forces.get(e.source)!.y+=dy/d*s;forces.get(e.target)!.x-=dx/d*s;forces.get(e.target)!.y-=dy/d*s;}
    for(const id of ids){if(id===root)continue;const p=points.get(id)!,f=forces.get(id)!;p.x+=Math.max(-12,Math.min(12,f.x));p.y+=Math.max(-12,Math.min(12,f.y));}
  }return points;
}
function handles(a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y;const side=Math.abs(dx)>Math.abs(dy)?dx>0?'r':'l':dy>0?'b':'t';const opposite={r:'l',l:'r',b:'t',t:'b'};return {sourceHandle:`${side}-source`,targetHandle:`${opposite[side]}-target`};}
type Props={graph:NetworkData;rootId:string;onSelect:(id:string,kind:NodeKind)=>void;mode:'network'|'generations';selectedId?:string|null;focusRequest?:{id:string;revision:number}|null};
function Canvas({graph,rootId,onSelect,mode,selectedId,focusRequest}:Props){
  const [nodes,setNodes,onNodesChange]=useNodesState<InkNode|SectionNode>([]);const [edges,setEdges]=useState<Edge[]>([]);const [error,setError]=useState('');const [laying,setLaying]=useState(true);const [layoutVersion,setLayoutVersion]=useState(0);const {fitView}=useReactFlow();const container=useRef<HTMLDivElement>(null);const selectRef=useRef(onSelect);selectRef.current=onSelect;const focusRef=useRef(focusRequest);focusRef.current=focusRequest;
  useEffect(()=>{if(!container.current)return;let frame=0;const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const focus=focusRef.current;void fitView({nodes:focus?[{id:focus.id}]:undefined,padding:focus ? .6 : .1,duration:0,maxZoom:1.05,minZoom:.01});});});observer.observe(container.current);return()=>{cancelAnimationFrame(frame);observer.disconnect();};},[fitView]);
  useEffect(()=>{let stale=false;setLaying(true);setError('');async function layout(){
    const identities=[...graph.people.map(p=>({id:p.id,label:p.name,kind:'person' as NodeKind,status:p.status})),...graph.entities.map(n=>({id:n.id,label:n.label,kind:n.kind,status:n.status}))];
    const segments:Segment[]=[...graph.relationships.map(r=>({id:r.id,source:r.sourceId,target:r.targetId,label:r.type==='parent'?'Filiación':typeLabels[r.type],status:r.status,arrow:r.type==='parent',spiritual:r.type==='godparent'})),...graph.connections.map(c=>({id:c.id,source:c.type==='union_child'?c.targetId:c.sourceId,target:c.type==='union_child'?c.sourceId:c.targetId,label:connectionLabels[c.type],status:c.status,arrow:c.type==='union_child'}))];
    let elk:ELK|undefined;
    if(mode==='generations'){const {default:ELK}=await import('elkjs/lib/elk.bundled.js');elk=new ELK();}
    async function layoutPart(ids:string[],links:{source:string;target:string}[]){
      if(!elk)return radial(ids,links as Segment[],ids.includes(rootId)?rootId:ids[0]);
      const result=await elk.layout({id:'network',layoutOptions:{'elk.algorithm':'layered','elk.direction':'DOWN','elk.spacing.nodeNode':'50','elk.layered.spacing.nodeNodeBetweenLayers':'90'},children:ids.map(id=>({id,width:174,height:170})),edges:links.map((e,i)=>({id:'edge-'+i,sources:[e.source],targets:[e.target]}))});return new Map(result.children!.map(n=>[n.id,{x:n.x??0,y:n.y??0}]));
    }
    let points:Map<string,Point>;let labels:OverviewLabel[]=[];
    if(graph.overview){const result=await overviewLayout(identities.map(n=>n.id),segments,layoutPart);points=result.positions;labels=result.labels;}
    else points=await layoutPart(identities.map(n=>n.id),segments);
    if(stale)return;
    const inkNodes:InkNode[]=identities.map(n=>({id:n.id,type:'ink',position:points.get(n.id)!,width:174,height:170,data:{...n,root:n.id===rootId,onSelect:(id:string,kind:NodeKind)=>selectRef.current(id,kind)},ariaLabel:n.label}));
    const sectionNodes:SectionNode[]=labels.map(n=>({id:n.id,type:'sectionLabel',position:n.position,width:650,height:45,data:{label:n.label},selectable:false,focusable:false,draggable:false}));
    setNodes([...sectionNodes,...inkNodes]);
    setEdges(segments.map(e=>{const color=e.status==='disputed'?'#984f55':e.status==='pending'?'#b18051':'#506b68';return {id:e.id,source:e.source,target:e.target,...handles(points.get(e.source)!,points.get(e.target)!),type:'default',label:graph.overview?undefined:e.label,ariaLabel:e.label,style:{stroke:color,strokeWidth:1.35,strokeDasharray:e.status==='pending'?'6 5':e.spiritual?'2 5':undefined},markerEnd:e.arrow?{type:MarkerType.ArrowClosed,width:13,height:13,color}:undefined,labelStyle:{fill:'#526768',fontSize:10},labelBgStyle:{fill:'#faf7ef',fillOpacity:.94},labelBgPadding:[5,3] as [number,number],labelBgBorderRadius:4};}));setLaying(false);setLayoutVersion(v=>v+1);
  }void layout().catch(e=>{if(!stale){setError('No se pudo ordenar la red. Las fichas siguen disponibles en Personas.');setLaying(false);console.error(e);}});return()=>{stale=true;};},[graph,rootId,mode,setNodes]);
  useEffect(()=>{if(layoutVersion){const frame=requestAnimationFrame(()=>{const focus=focusRef.current;void fitView({nodes:focus?[{id:focus.id}]:undefined,padding:focus ? .6 : .1,duration:0,maxZoom:1.05,minZoom:.01});});return()=>cancelAnimationFrame(frame);}},[layoutVersion,fitView]);
  useEffect(()=>{if(focusRequest&&!laying)void fitView({nodes:[{id:focusRequest.id}],padding:.6,duration:250,maxZoom:1.05});},[focusRequest,laying,fitView]);
  return <div className="graph-canvas ink-canvas" ref={container}>{laying&&<div className="canvas-message" role="status">Trazando los vínculos…</div>}{error&&<div className="canvas-message" role="alert">{error}</div>}
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} nodeTypes={nodeTypes} onNodeClick={(_,n)=>{if(n.type==='ink')onSelect(n.id,n.data.kind);}} nodesConnectable={false} nodesDraggable={false} minZoom={.01} maxZoom={2} fitView attributionPosition="bottom-right"><Controls showInteractive={false}/>{graph.overview&&<MiniMap pannable zoomable ariaLabel="Minimapa de toda la familia" nodeColor={n=>n.type==='sectionLabel'?'transparent':n.data.root?'#a3674d':'#65817d'} maskColor="#f5f2e1b8"/>}</ReactFlow>
    <button className="recenter" onClick={()=>fitView({padding:.10,maxZoom:1.05,minZoom:.01,duration:300})}><Focus size={15}/>{graph.overview?'Ver todo el mapa':'Centrar red'}</button>{selectedId&&<button className="focus-person" onClick={()=>fitView({nodes:[{id:selectedId}],padding:.6,maxZoom:1.05,duration:250})}>Acercar a la ficha</button>}<div className="graph-legend"><span><i className="legend-line"/>Respaldado</span><span><i className="legend-line pending"/>Por confirmar</span><span><i className="legend-line disputed"/>En conflicto</span></div>{graph.truncated&&<p className="graph-limit">Vista limitada a 100 nodos. Reduce el alcance o explora desde otro nodo.</p>}
  </div>;
}
export default function Graph(props:Props){return <ReactFlowProvider><Canvas {...props}/></ReactFlowProvider>;}
