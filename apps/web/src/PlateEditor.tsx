import {useEffect,useMemo,useRef,useState} from 'react';
import {Download,ImagePlus,Search} from 'lucide-react';
import {api,mutate,fileBase64} from './api';
import {connectedParts} from './overviewLayout';
import {plateGraph,suggestedDates} from './plateModel';
import {PersonCombobox} from './PersonCombobox';
import {arrangePlate,portraitData,renderPlate,type PlateLayout} from './plateRenderer';
import type {NetworkData} from '../../../packages/contracts/network';
import type {PlatePersonInfo} from '../../../packages/contracts/plates';
import './plates.css';

export default function PlateEditor({referenceId,visibleIds}:{referenceId:string;visibleIds:string[]}){
  const [graph,setGraph]=useState<NetworkData|null>(null),[info,setInfo]=useState<PlatePersonInfo[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set()),[anchor,setAnchor]=useState(referenceId),[editing,setEditing]=useState(referenceId);
  const [title,setTitle]=useState('Nuestra historia familiar'),[query,setQuery]=useState(''),[other,setOther]=useState(false),[showDates,setShowDates]=useState(true);
  const [dates,setDates]=useState<Record<string,string>>({}),[photos,setPhotos]=useState<Record<string,string>>({});
  const [layout,setLayout]=useState<PlateLayout|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[drawing,setDrawing]=useState(false),[uploading,setUploading]=useState(false);
  const [preview,setPreview]=useState<{blob:Blob;url:string;width:number;height:number;displayWidth:number}|null>(null),[zoom,setZoom]=useState('fit');
  const photoRequest=useRef(0);
  const [exporting,setExporting]=useState(false),[exported,setExported]=useState<{url:string;path:string}|null>(null);
  const previewRef=useRef('');previewRef.current=preview?.url??'';
  function branch(data:NetworkData,id:string){const groups=connectedParts([...data.people,...data.entities].map(n=>n.id),[...data.relationships,...data.connections].map(e=>({source:e.sourceId,target:e.targetId})));const members=new Set(groups.find(p=>p.includes(id))??[id]);return new Set(data.people.filter(p=>members.has(p.id)).map(p=>p.id));}
  useEffect(()=>{const controller=new AbortController();api<NetworkData>('/network?includePending=true&context=true',{signal:controller.signal}).then(async data=>{
    const metadata=await api<PlatePersonInfo[]>('/plates/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:data.people.map(p=>p.id)}),signal:controller.signal});
    if(controller.signal.aborted)return;setGraph(data);const initial=branch(data,referenceId);setSelected(initial);setEditing(initial.has(referenceId)?referenceId:[...initial][0]??'');setInfo(metadata);setDates(Object.fromEntries(metadata.map(p=>[p.id,suggestedDates(p)])));setLoading(false);
  }).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});return()=>{controller.abort();photoRequest.current++;};},[referenceId]);
  const model=useMemo(()=>graph?plateGraph(graph,selected,other):null,[graph,selected,other]);
  const valid=selected.size>0&&selected.size<=80;
  useEffect(()=>{let stale=false;setLayout(null);if(!model||!valid)return;setDrawing(true);setError('');arrangePlate(model.nodes,model.edges).then(result=>{if(!stale)setLayout(result);}).catch(e=>{if(!stale){setError(e.message);setDrawing(false);}});return()=>{stale=true;};},[model,valid]);
  useEffect(()=>{let stale=false;let objectUrl='';setPreview(null);setExported(null);if(!layout)return;setDrawing(true);const timer=setTimeout(()=>{renderPlate(layout,title,dates,photos,showDates).then(result=>{if(stale)return;objectUrl=URL.createObjectURL(result.blob);setPreview({...result,url:objectUrl});setDrawing(false);}).catch(e=>{if(!stale){setError(e.message);setDrawing(false);}});},180);return()=>{stale=true;clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);};},[layout,title,dates,photos,showDates]);
  const editor=graph?.people.find(p=>p.id===editing&&selected.has(p.id));
  const metadata=info.find(p=>p.id===editing);
  const normalized=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
  const choices=graph?.people.filter(p=>normalized(p.name).includes(normalized(query)))??[];
  function choose(ids:Set<string>){setSelected(ids);if(!ids.has(editing))setEditing([...ids][0]??'');}
  async function photo(file:File,id:string){const request=++photoRequest.current;setUploading(true);setError('');try{const data=await portraitData(file);if(request===photoRequest.current)setPhotos(p=>({...p,[id]:data}));}catch(e){if(request===photoRequest.current)setError((e as Error).message);}finally{if(request===photoRequest.current)setUploading(false);}}
  async function download(){if(!preview)return;const current=preview;setExporting(true);setError('');try{const result=await mutate<{url:string;filename:string;path:string}>('/plates/export',{title,base64:await fileBase64(new File([current.blob],'lamina.png',{type:'image/png'}))});if(previewRef.current===current.url){setExported(result);const link=document.createElement('a');link.href=result.url+'?download=1&name='+encodeURIComponent(result.filename);link.download=result.filename;document.body.append(link);link.click();link.remove();}}catch(e){setError((e as Error).message);}finally{setExporting(false);}}
  if(loading)return <p role="status">Preparando las ramas del archivo…</p>;
  return <div className="plate-editor">
    <aside className="plate-settings">
      <p className="plate-intro">Una rama de la familia, para guardar o compartir.</p>
      <label>Título de la lámina<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100}/></label>
      {graph&&<PersonCombobox label="Ficha de referencia" people={graph.people} value={anchor} onChange={id=>{setAnchor(id);choose(branch(graph,id));setEditing(id);}}/>}
      <div className="plate-picks"><button onClick={()=>{if(graph)choose(branch(graph,anchor));}}>Rama conectada</button><button onClick={()=>choose(new Set(visibleIds))}>Vista actual</button><button onClick={()=>choose(new Set())}>Vaciar</button></div>
      <p className="plate-count"><strong>{selected.size} personas elegidas</strong> · {model?.nodes.filter(n=>n.kind==='union').length??0} uniones</p>
      <div className="plate-search"><Search size={15}/><input aria-label="Buscar personas para la lámina" placeholder="Añadir o quitar nombres…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <div className="plate-people" role="group" aria-label="Personas de la lámina">{choices.map(p=><label key={p.id}><input type="checkbox" checked={selected.has(p.id)} onChange={e=>{const next=new Set(selected);if(e.target.checked)next.add(p.id);else next.delete(p.id);choose(next);}}/><span>{p.name}</span></label>)}</div>
      {!valid&&<p className="plate-warning" role="status">{selected.size?'Elige hasta 80 personas por lámina para conservar la legibilidad.':'Selecciona al menos una persona.'}</p>}
      <div className="plate-options"><label><input type="checkbox" checked={showDates} onChange={e=>setShowDates(e.target.checked)}/>Mostrar fechas</label><label><input type="checkbox" checked={other} onChange={e=>setOther(e.target.checked)}/>Incluir padrinazgos y cercanía</label></div>
      {!!selected.size&&<section className="plate-person-editor"><label>Retrato y fechas de<select value={editing} onChange={e=>setEditing(e.target.value)}>{graph?.people.filter(p=>selected.has(p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {editor&&<><label>Fechas que aparecerán<input aria-label={`Fechas de ${editor.name}`} maxLength={120} value={dates[editing]??''} onChange={e=>setDates(d=>({...d,[editing]:e.target.value}))} placeholder="Ej.: n. 1955 · f. 2020"/></label>{metadata?.original&&<details><summary>Consultar registro original</summary><p>{metadata.original}</p></details>}
        <div className="plate-photo-row">{photos[editing]&&<img src={photos[editing]} alt={`Retrato de ${editor.name}`}/>}<label className="button secondary plate-upload"><ImagePlus size={15}/>{uploading?'Leyendo…':'Elegir retrato'}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Retrato para ${editor.name}`} disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void photo(file,editing);e.target.value='';}}/></label>{photos[editing]&&<button className="text-link" onClick={()=>setPhotos(p=>{const next={...p};delete next[editing];return next;})}>Quitar</button>}</div></>}
      </section>}
      <p className="plate-local-note">Los retratos y ajustes se usan solo en esta lámina. Al cerrar se descartan; tus fichas no cambian. Sin retrato se muestran iniciales. Las fechas dudosas conservan «?».</p>
    </aside>
    <section className="plate-proof" aria-label="Vista previa de la lámina">
      <div className="plate-proof-toolbar"><span>Prueba de impresión</span><label>Vista<select aria-label="Zoom de la lámina" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">Encajar</option><option value=".5">50 %</option><option value="1">100 %</option></select></label></div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="plate-preview-scroll">{valid&&drawing&&<p role="status">Dibujando la lámina…</p>}{preview&&valid?<img className={zoom==='fit'?'plate-fit':''} style={zoom==='fit'?undefined:{width:preview.displayWidth*Number(zoom),maxWidth:'none'}} src={preview.url} alt={`Lámina «${title}» con ${selected.size} personas y sus vínculos`}/>:!drawing&&<p>Elige las personas que quieres conservar en esta lámina.</p>}</div>
      <div className="plate-download"><p>{preview&&valid?`${preview.width} × ${preview.height} px · PNG`:'La imagen se genera en este equipo.'}<small>Se incluyen todos los nombres seleccionados y los vínculos visibles entre ellos.</small></p><button className="button primary" disabled={!preview||!valid||drawing||uploading||exporting} onClick={()=>void download()}><Download size={16}/>{exporting?'Guardando…':'Descargar PNG'}</button></div>{exported&&<p className="plate-saved" role="status">Lámina guardada en la carpeta local de exportaciones. <a href={exported.url} target="_blank" rel="noreferrer">Abrir PNG</a></p>}
    </section>
  </div>;
}
