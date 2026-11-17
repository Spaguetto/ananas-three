import {useEffect,useId,useState} from 'react';
import {Download,FileText,Paperclip,X,ArrowUpRight} from 'lucide-react';
import {fileBase64} from './api';
import {MAX_EVIDENCE_FILES,MAX_EVIDENCE_FILE_BYTES,MAX_EVIDENCE_TOTAL_BYTES,previewableImage,type EvidenceFile} from '../../../packages/contracts/evidence';
import './evidence.css';

const fileSize=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.ceil(bytes/1024))} KB`;
export const serializeEvidenceFiles=(files:File[])=>Promise.all(files.map(async file=>({name:file.name,base64:await fileBase64(file)})));

export function EvidenceInput({files,onFiles,busy}:{files:File[];onFiles:(files:File[])=>void;busy:boolean}){
  const id=useId();
  const [error,setError]=useState(''),[dragging,setDragging]=useState(false),[previews,setPreviews]=useState<Map<File,string>>(new Map());
  useEffect(()=>{
    const urls=new Map(files.filter(file=>previewableImage(file.type)).map(file=>[file,URL.createObjectURL(file)]));
    setPreviews(urls);return()=>{for(const url of urls.values())URL.revokeObjectURL(url);};
  },[files]);
  function add(incoming:File[]){
    if(busy)return;
    const next=[...files];
    for(const file of incoming){
      if(!file.size||file.size>MAX_EVIDENCE_FILE_BYTES){setError(`«${file.name}» debe tener contenido y pesar como máximo 10 MB.`);return;}
      if(!next.some(previous=>previous.name===file.name&&previous.size===file.size&&previous.lastModified===file.lastModified))next.push(file);
    }
    if(next.length>MAX_EVIDENCE_FILES){setError('Puedes adjuntar hasta 10 archivos por entrega.');return;}
    if(next.reduce((bytes,file)=>bytes+file.size,0)>MAX_EVIDENCE_TOTAL_BYTES){setError('Los archivos no pueden superar 25 MB en total.');return;}
    setError('');onFiles(next);
  }
  return <section className={`evidence-input${dragging?' is-dragging':''}`} aria-label="Texto y archivos de evidencia"
    onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();if(!busy)setDragging(true);}}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDragging(false);}}
    onDrop={e=>{e.preventDefault();setDragging(false);add(Array.from(e.dataTransfer.files));}}
    onPaste={e=>{if(e.clipboardData.files.length){if(!e.clipboardData.getData('text/plain'))e.preventDefault();add(Array.from(e.clipboardData.files));}}}>
    <label htmlFor={id}>Evidencia <span className="evidence-optional">Texto, imágenes o documentos</span></label>
    <textarea id={id} name="evidence" required={!files.length} minLength={3} maxLength={5000} rows={3} disabled={busy}
      aria-describedby={id+'-help'} placeholder="Cuenta qué demuestra esta evidencia, de dónde viene o pega aquí el texto…"/>
    <div className="evidence-dropzone">
      <Paperclip size={22} strokeWidth={1.4}/>
      <div><strong>{dragging?'Suelta aquí los archivos':'Conserva la prueba junto al vínculo'}</strong><p>Arrastra archivos o pega una imagen en este campo.</p></div>
      <label className={`button secondary evidence-upload${busy?' disabled':''}`}>
        Adjuntar archivos<input type="file" multiple disabled={busy} aria-label="Adjuntar archivos de evidencia" onChange={e=>{add(Array.from(e.target.files??[]));e.target.value='';}}/>
      </label>
    </div>
    <p className="evidence-help" id={id+'-help'}>Fotos, PDF, texto y otros documentos. Hasta 10 archivos, 10 MB por archivo y 25 MB en total. Se guardarán al enviar el formulario.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!!files.length&&<ul className="evidence-drafts" aria-label="Archivos pendientes de guardar">{files.map((file,index)=><li key={`${file.name}-${file.size}-${file.lastModified}`}>
      {previews.has(file)?<img src={previews.get(file)} alt={`Vista previa de ${file.name}`}/>:<FileText size={27} strokeWidth={1.4}/>}
      <div><strong>{file.name}</strong><small>{fileSize(file.size)} · Sin guardar</small></div>
      <button type="button" className="icon-button" aria-label={`Quitar ${file.name}`} disabled={busy} onClick={()=>{setError('');onFiles(files.filter((_,i)=>i!==index));}}><X size={16}/></button>
    </li>)}</ul>}
  </section>;
}

export function EvidenceAttachments({files}:{files:EvidenceFile[]}){
  if(!files.length)return null;
  return <div className="evidence-attachments">{files.map(file=>{
    const url=`/api/sources/${file.id}/content`;
    return <article className="evidence-attachment" key={file.id}>
      {previewableImage(file.mime)?<a className="evidence-image" href={url} target="_blank" rel="noreferrer"><img loading="lazy" src={url} alt={file.name}/></a>:<FileText size={30} strokeWidth={1.3}/>}
      <div><strong>{file.name}</strong><small>{fileSize(file.bytes)}</small><div className="evidence-file-actions">
        <a className="text-link" href={url} target="_blank" rel="noreferrer">Abrir <ArrowUpRight size={13}/></a>
        <a className="text-link" href={`${url}?download=1&name=${encodeURIComponent(file.name)}`} download={file.name}>Descargar <Download size={13}/></a>
      </div></div>
    </article>;
  })}</div>;
}
