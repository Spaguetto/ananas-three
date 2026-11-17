import { useState, type FormEvent } from 'react';
import { Plus, HeartPulse, NotebookPen, BriefcaseBusiness } from 'lucide-react';
import { fieldInput, fieldTypeLabels, type FieldInput, type FieldType, type PersonField } from '../../../packages/contracts';

export type FieldPreset='health'|'work'|'memory';
const presets:Record<FieldPreset,Partial<FieldInput>>={
  health:{label:'Estado de salud',section:'Salud',type:'select',options:['Sin información','Sin enfermedad conocida','Enfermedad en curso','En recuperación'],sensitive:true},
  work:{label:'Ocupación',section:'Trabajo',type:'text'},
  memory:{label:'Un recuerdo',section:'Recuerdos',type:'longtext'},
};
function initialValue(field?:PersonField){if(!field)return '';if(field.type==='json')return JSON.stringify(field.value,null,2);if(field.type==='list')return (field.value as string[]).join('\n');if(field.value===null)return 'unknown';return String(field.value);}
export default function FieldEditor({personName,field,preset,sections,onSave,busy}:{personName:string;field?:PersonField;preset?:FieldPreset;sections:string[];onSave:(f:FieldInput)=>void;busy:boolean}){
  const initial=field??(preset?presets[preset]:{});
  const [type,setType]=useState<FieldType>(initial.type??'text');
  const [label,setLabel]=useState(initial.label??'');const [section,setSection]=useState(initial.section??'Personal');
  const [input,setInput]=useState(initialValue(field));const [options,setOptions]=useState(initial.options?.join('\n')??'');
  const [sensitive,setSensitive]=useState(initial.sensitive??false);const [error,setError]=useState('');
  const choose=(key:FieldPreset)=>{const p=presets[key];setType(p.type!);setLabel(p.label!);setSection(p.section!);setOptions(p.options?.join('\n')??'');setInput('');setSensitive(p.sensitive??false);setError('');};
  const changeType=(next:FieldType)=>{setType(next);setInput('');setError('');};
  const submit=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setError('');const f=new FormData(e.currentTarget);
    try{
      const val=type==='number'?(input.trim()===''?null:Number(input)):type==='boolean'?(input==='true'?true:input==='false'?false:null):type==='json'?JSON.parse(input):type==='list'?input.split('\n').map(x=>x.trim()).filter(Boolean):input;
      const result=fieldInput.safeParse({label,section,type,value:val,options:type==='select'?options.split('\n').map(x=>x.trim()).filter(Boolean):[],sensitive,notes:f.get('notes'),source:f.get('source'),observedAt:f.get('observedAt')});
      if(!result.success){setError(result.error.issues.map(x=>x.message).join(' '));return;}
      onSave(result.data);
    }catch{setError('Revisa el JSON: utiliza comillas dobles y una estructura válida de objeto o lista.');}
  };
  return <form className="field-editor" onSubmit={submit}>
    <p className="editor-person">En el expediente de <strong>{personName}</strong></p>
    {!field&&<div className="field-presets" aria-label="Ideas para empezar"><span>Empieza con una idea</span><button type="button" onClick={()=>choose('health')}><HeartPulse size={15}/>Salud</button><button type="button" onClick={()=>choose('work')}><BriefcaseBusiness size={15}/>Trabajo</button><button type="button" onClick={()=>choose('memory')}><NotebookPen size={15}/>Recuerdo</button></div>}
    <div className="form-pair"><label>Nombre del campo<input autoFocus required maxLength={100} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Por ejemplo: ¿Tiene alguna enfermedad?"/></label><label>Sección<input required maxLength={80} list="field-sections" value={section} onChange={e=>setSection(e.target.value)}/></label></div>
    <datalist id="field-sections">{[...new Set(['Personal','Salud','Trabajo','Recuerdos','Contacto',...sections])].map(s=><option key={s} value={s}/>)}</datalist>
    <label>Tipo de campo<select value={type} onChange={e=>changeType(e.target.value as FieldType)}>{Object.entries(fieldTypeLabels).map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>
    {type==='select'&&<label>Opciones disponibles (una por línea)<textarea rows={3} required value={options} onChange={e=>{setOptions(e.target.value);if(!e.target.value.split('\n').map(x=>x.trim()).includes(input))setInput('');}} placeholder={'Sin información\nEn recuperación\nOtra opción que tú elijas'}/></label>}
    <label>{type==='list'?'Contenido (un elemento por línea)':type==='json'?'Contenido JSON':'Valor'}
      {type==='boolean'?<select value={input||'unknown'} onChange={e=>setInput(e.target.value)}><option value="unknown">No se sabe</option><option value="true">Sí</option><option value="false">No</option></select>
      :type==='select'?<select required value={input} onChange={e=>setInput(e.target.value)}><option value="" disabled>Selecciona un valor</option>{[...new Set(options.split('\n').map(x=>x.trim()).filter(Boolean))].map(x=><option value={x} key={x}>{x}</option>)}</select>
      :['longtext','list','json'].includes(type)?<textarea required rows={type==='json'?6:4} className={type==='json'?'json-input':undefined} value={input} onChange={e=>setInput(e.target.value)} placeholder={type==='json'?'{"dato": "valor", "detalles": []}':type==='list'?'Un elemento\nOtro elemento':'Escribe con el detalle que necesites…'}/>
      :<input required type={type==='date'?'date':type==='number'?'number':'text'} step={type==='number'?'any':undefined} max={type==='date'?'9999-12-31':undefined} value={input} onChange={e=>setInput(e.target.value)}/>}
    </label>
    {type==='date'&&<p className="form-hint">Para fechas aproximadas como «hacia 1920», usa un campo de texto.</p>}
    <details className="field-context" open={!!field?.notes||!!field?.source||!!field?.observedAt}><summary>Añadir contexto <span>opcional</span></summary><div><label>Notas<textarea name="notes" rows={2} maxLength={10000} defaultValue={field?.notes} placeholder="Detalles, aclaraciones o cambios con el tiempo…"/></label><div className="form-pair"><label>Fuente o quién lo contó<input name="source" maxLength={2000} defaultValue={field?.source} placeholder="Recuerdo personal, conversación, documento…"/></label><label>Fecha de observación<input name="observedAt" type="date" max="9999-12-31" defaultValue={field?.observedAt}/></label></div></div></details>
    <label className="sensitive-control"><input type="checkbox" checked={sensitive} onChange={e=>setSensitive(e.target.checked)}/><span>Marcar como información sensible<small>Se mostrará plegada en la ficha. Esta marca no cifra ni excluye el dato de la exportación.</small></span></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="editor-footer"><span>Un campo propio, unido a su identidad.</span><button className="button primary" disabled={busy}><Plus size={16}/>{busy?'Guardando…':field?'Guardar cambios':'Guardar campo'}</button></div>
  </form>;
}
