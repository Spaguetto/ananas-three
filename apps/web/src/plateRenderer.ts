import type {ElkNode} from 'elkjs/lib/elk-api';
import type {PlateNode,PlateEdge} from './plateModel';
export interface PlateLayout {nodes:(PlateNode&{x:number;y:number})[];edges:(PlateEdge&{points:{x:number;y:number}[]})[];width:number;height:number}
export async function arrangePlate(nodes:PlateNode[],edges:PlateEdge[]):Promise<PlateLayout>{
  const {default:ELK}=await import('elkjs/lib/elk.bundled.js');
  const elk=new ELK();
  const result:ElkNode=await elk.layout({id:'plate',layoutOptions:{'elk.algorithm':'layered','elk.direction':'DOWN','elk.edgeRouting':'ORTHOGONAL','elk.spacing.nodeNode':'45','elk.layered.spacing.nodeNodeBetweenLayers':'65','elk.spacing.componentComponent':'90'},children:nodes.map(n=>({id:n.id,width:n.kind==='person'?240:38,height:n.kind==='person'?250:38})),edges:edges.map(e=>({id:e.id,sources:[e.source],targets:[e.target]}))});
  const points=new Map(result.children!.map(n=>[n.id,n]));
  return {width:result.width??240,height:result.height??250,nodes:nodes.map(n=>({...n,x:points.get(n.id)?.x??0,y:points.get(n.id)?.y??0})),edges:edges.map(e=>({...e,points:(result.edges?.find(x=>x.id===e.id)?.sections??[]).flatMap(s=>[s.startPoint,...s.bendPoints??[],s.endPoint])}))};
}
function imageFrom(url:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo leer uno de los retratos. Vuelve a seleccionarlo.'));img.src=url;});}
export async function portraitData(file:File){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('El retrato debe ser JPG, PNG o WebP.');
  if(file.size>20*1024*1024)throw new Error('El retrato supera los 20 MB.');
  const url=URL.createObjectURL(file);
  try{const img=await imageFrom(url);const canvas=document.createElement('canvas');const scale=Math.min(1,900/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const c=canvas.getContext('2d')!;c.fillStyle='#f0e6cc';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.9);}finally{URL.revokeObjectURL(url);}
}
function wrapped(c:CanvasRenderingContext2D,text:string,width:number){
  const lines:string[]=[];let line='';
  for(const word of text.split(/\s+/)){
    if(c.measureText(word).width>width){if(line)lines.push(line);line='';for(const char of word){if(c.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}continue;}
    const next=line?line+' '+word:word;if(c.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;
  }if(line)lines.push(line);return lines;
}
function textBlock(c:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,height:number,size:number,family='Cormorant Garamond',italic=false){
  let lines:string[]=[];
  do{c.font=`${italic?'italic ':''}${size}px "${family}"`;lines=wrapped(c,text,width);if(lines.length*size*1.08<=height)break;size--;}while(size>9);
  c.textAlign='center';c.textBaseline='top';lines.forEach((line,i)=>c.fillText(line,x,y+i*size*1.08));
}
function leaf(c:CanvasRenderingContext2D,x:number,y:number,angle:number){c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(5,-16,23,-18);c.quadraticCurveTo(20,-3,0,0);c.fillStyle='#6f785a55';c.fill();c.strokeStyle='#63705299';c.lineWidth=.7;c.stroke();c.restore();}
export async function renderPlate(layout:PlateLayout,title:string,dates:Record<string,string>,portraits:Record<string,string>,showDates:boolean){
  await Promise.all([document.fonts.load('28px "Cormorant Garamond"'),document.fonts.load('italic 22px "Cormorant Garamond"'),document.fonts.load('16px "Source Sans 3"')]);
  const pictures=new Map(await Promise.all(layout.nodes.filter(n=>portraits[n.id]).map(async n=>[n.id,await imageFrom(portraits[n.id])] as const)));
  const w=Math.max(1100,Math.ceil(layout.width+180)),h=Math.ceil(layout.height+400);
  const scale=Math.min(2,8192/w,8192/h,Math.sqrt(24_000_000/(w*h)));
  const canvas=document.createElement('canvas');canvas.width=Math.floor(w*scale);canvas.height=Math.floor(h*scale);const c=canvas.getContext('2d');if(!c)throw new Error('No se pudo preparar la imagen en este navegador.');c.scale(scale,scale);
  // A deterministic deckled outline and grain, generated directly from the graph renderer.
  c.beginPath();c.moveTo(18,18);for(let x=18;x<w-18;x+=16)c.lineTo(x,17+Math.sin(x*1.7)*3);for(let y=18;y<h-18;y+=16)c.lineTo(w-17+Math.sin(y*1.3)*3,y);for(let x=w-18;x>18;x-=16)c.lineTo(x,h-17+Math.sin(x*1.1)*3);for(let y=h-18;y>18;y-=16)c.lineTo(17+Math.sin(y*1.9)*3,y);c.closePath();c.fillStyle='#f1e7ca';c.fill();c.save();c.clip();
  const wash=c.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.max(w,h)*.65);wash.addColorStop(0,'#fffaf055');wash.addColorStop(1,'#bba47230');c.fillStyle=wash;c.fillRect(0,0,w,h);
  let seed=7;for(let i=0;i<16000;i++){seed=(seed*16807)%2147483647;const x=seed/2147483647*w;seed=(seed*16807)%2147483647;const y=seed/2147483647*h;c.fillStyle=i%2?'#806a3c09':'#fff9e521';c.fillRect(x,y,1.5,1.5);}c.restore();
  c.strokeStyle='#7b7556';c.lineWidth=1.2;c.strokeRect(36,36,w-72,h-72);c.strokeStyle='#8c805f66';c.strokeRect(42,42,w-84,h-84);
  c.fillStyle='#344638';textBlock(c,title.trim()||'Nuestra historia familiar',w/2,75,Math.min(w-220,1500),90,64);
  const count=layout.nodes.filter(n=>n.kind==='person').length;c.fillStyle='#6a7057';textBlock(c,`${count} ${count===1?'persona':'personas'} · Entre ramas`,w/2,173,w-180,28,21,'Cormorant Garamond',true);
  c.beginPath();c.moveTo(w/2-125,215);c.lineTo(w/2+125,215);c.strokeStyle='#8c805f';c.stroke();for(const direction of [-1,1])for(let i=0;i<4;i++)leaf(c,w/2+direction*(72+i*19),215,direction<0?Math.PI:.15);
  c.save();c.translate((w-layout.width)/2,255);
  for(const e of layout.edges){
    if(e.points.length<2)continue;
    c.strokeStyle=e.status==='disputed'?'#9d5054':e.status==='pending'?'#9b7448':'#596a4e';c.lineWidth=['close','godparent'].includes(e.type)?1.3:2;c.setLineDash(e.status==='pending'?[7,5]:e.status==='disputed'?[3,4]:e.type==='godparent'?[2,5]:[]);c.lineJoin='round';c.lineCap='round';
    c.beginPath();e.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();c.setLineDash([]);
    if(['parent','union_child'].includes(e.type)){const p=e.points.at(-1)!,q=e.points.at(-2)!,a=Math.atan2(p.y-q.y,p.x-q.x);c.beginPath();c.moveTo(p.x-7*Math.cos(a-.4),p.y-7*Math.sin(a-.4));c.lineTo(p.x,p.y);c.lineTo(p.x-7*Math.cos(a+.4),p.y-7*Math.sin(a+.4));c.stroke();const mid=e.points[Math.floor((e.points.length-1)/2)];leaf(c,mid.x,mid.y,-.3);}
  }
  for(const n of layout.nodes){
    if(n.kind==='union'){c.strokeStyle=n.status==='disputed'?'#9d5054':'#8b744e';c.lineWidth=1.5;c.beginPath();c.ellipse(n.x+15,n.y+17,7,9,0,0,Math.PI*2);c.ellipse(n.x+23,n.y+17,7,9,0,0,Math.PI*2);c.stroke();continue;}
    const x=n.x+120,y=n.y;const img=pictures.get(n.id);
    c.save();c.beginPath();c.ellipse(x,y+56,43,51,0,0,Math.PI*2);c.clip();c.fillStyle='#dadcc8';c.fillRect(x-44,y+4,88,104);
    if(img){const s=Math.max(86/img.width,102/img.height);c.drawImage(img,x-img.width*s/2,y+56-img.height*s/2,img.width*s,img.height*s);}else{c.fillStyle='#596b56';c.font='italic 36px "Cormorant Garamond"';c.textAlign='center';c.textBaseline='middle';c.fillText(n.label.split(/\s+/).slice(0,2).map(s=>s[0]).join(''),x,y+56);}c.restore();
    c.lineWidth=1;c.strokeStyle='#7d8063';c.beginPath();c.ellipse(x,y+56,47,55,.025,0,Math.PI*2);c.stroke();c.beginPath();c.ellipse(x,y+56,50,58,-.018,0,Math.PI*2);c.stroke();
    c.fillStyle='#344638';textBlock(c,n.label,x,y+125,225,78,29);
    if(showDates&&dates[n.id]){c.fillStyle='#74664f';textBlock(c,dates[n.id],x,y+207,225,39,17,'Source Sans 3');}
  }c.restore();
  c.fillStyle='#6c6c52';const pending=layout.edges.filter(e=>e.status==='pending').length,conflicts=layout.edges.filter(e=>e.status==='disputed').length;
  textBlock(c,`Línea continua: respaldado · Discontinua: por confirmar · Roja: en conflicto${pending||conflicts?` — ${pending} pendientes, ${conflicts} en conflicto`:''}`,w/2,h-106,w-150,24,16,'Source Sans 3');
  textBlock(c,'Anillos: unión. Las líneas de descendencia asociada no acreditan por sí solas filiación. Las fechas con ? necesitan revisión.',w/2,h-78,w-150,22,14,'Source Sans 3');
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo generar el PNG. Reduce el grupo e inténtalo de nuevo.')),'image/png'));
  return {blob,width:canvas.width,height:canvas.height,displayWidth:w};
}
