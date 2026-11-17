export type Point={x:number;y:number};
export type LayoutEdge={source:string;target:string};
export type OverviewLabel={id:string;label:string;position:Point};

export function connectedParts(ids:string[],edges:LayoutEdge[]){
  const adjacency=new Map(ids.map(id=>[id,new Set<string>()]));
  for(const e of edges){if(!adjacency.has(e.source)||!adjacency.has(e.target))continue;adjacency.get(e.source)!.add(e.target);adjacency.get(e.target)!.add(e.source);}
  const seen=new Set<string>();const parts:string[][]=[];
  for(const id of ids){if(seen.has(id))continue;const part=[id];seen.add(id);for(let i=0;i<part.length;i++)for(const next of adjacency.get(part[i])!){if(!seen.has(next)){seen.add(next);part.push(next);}}parts.push(part);}
  return parts.sort((a,b)=>b.length-a.length);
}

// Pack each connected branch independently. Isolated identities have their own labelled grid.
export async function overviewLayout(ids:string[],edges:LayoutEdge[],layout:(ids:string[],edges:LayoutEdge[])=>Promise<Map<string,Point>>){
  const parts=connectedParts(ids,edges),linked=parts.filter(p=>p.length>1),isolated=parts.filter(p=>p.length===1).flat();
  const positions=new Map<string,Point>(),labels:OverviewLabel[]=[];
  const columns=Math.max(4,Math.ceil(Math.sqrt(ids.length)*1.1)),targetWidth=columns*205;
  let x=0,y=0,rowHeight=0;
  for(let index=0;index<linked.length;index++){
    const part=linked[index],members=new Set(part);const points=await layout(part,edges.filter(e=>members.has(e.source)&&members.has(e.target)));
    const values=[...points.values()];const minX=Math.min(...values.map(p=>p.x)),minY=Math.min(...values.map(p=>p.y));
    const width=Math.max(...values.map(p=>p.x))-minX+230,height=Math.max(...values.map(p=>p.y))-minY+250;
    if(x&&x+width>targetWidth){x=0;y+=rowHeight+100;rowHeight=0;}
    labels.push({id:`branch-label-${index}`,label:`Rama conectada ${index+1} · ${part.length} nodos`,position:{x,y}});
    for(const id of part){const p=points.get(id)!;positions.set(id,{x:x+p.x-minX+15,y:y+p.y-minY+75});}
    x+=width+100;rowHeight=Math.max(rowHeight,height);
  }
  if(isolated.length){const top=linked.length?y+rowHeight+130:0;labels.push({id:'isolated-label',label:`Sin vínculos visibles · ${isolated.length} fichas`,position:{x:0,y:top}});isolated.forEach((id,i)=>positions.set(id,{x:(i%columns)*205,y:top+80+Math.floor(i/columns)*195}));}
  return {positions,labels};
}
