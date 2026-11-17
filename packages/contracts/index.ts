import { z } from 'zod';
export const reviewStatus = z.enum(['pending', 'supported', 'disputed', 'rejected']);
export type ReviewStatus = z.infer<typeof reviewStatus>;
export const relationType = z.enum(['parent', 'partner', 'godparent', 'close']);
export type RelationType = z.infer<typeof relationType>;
export const personInput = z.object({
  name: z.string().trim().min(2, 'Escribe un nombre de al menos dos caracteres.').max(200),
  summary: z.string().trim().max(4000).default(''),
  lifeStatus: z.enum(['unknown', 'living', 'deceased']).default('unknown'),
});
export const personUpdate = personInput.extend({ version: z.number().int().positive() });
export const relationshipInput = z.object({
  sourceId: z.string().uuid(), targetId: z.string().uuid(), type: relationType,
  status: reviewStatus.default('pending'), context: z.string().trim().max(300).default(''),
  evidence: z.string().trim().min(3, 'Describe de dónde viene este vínculo.').max(5000),
});
export const assertionInput = z.object({
  personId: z.string().uuid(), property: z.string().trim().min(2).max(80), value: z.string().trim().min(1).max(5000),
  evidence: z.string().trim().min(3).max(5000), status: reviewStatus.default('pending'),
});
export interface Person { id: string; name: string; summary: string; lifeStatus: 'unknown'|'living'|'deceased'; status: ReviewStatus; version: number; createdAt: string; sourceRow: number|null }
export interface Assertion { id: string; personId: string; property: string; value: string; evidence: string; status: ReviewStatus; sourceId: string|null; sourceRow: number|null; version:number }
export interface Relationship { id: string; sourceId: string; targetId: string; type: RelationType; status: ReviewStatus; context: string; evidence: string; sourceRow: number|null; version: number }
export interface PersonDetail extends Person { assertions: Assertion[]; fields: PersonField[]; relationships: (Relationship & { other: Person })[] }
export interface GraphData { people: Person[]; relationships: Relationship[]; truncated: boolean }
export interface ImportRecord { id: string; row: number; label: string; description: string; tags: string; classification: string; personId: string|null; decision: string }
export interface ImportBatch { id: string; name: string; hash: string; status: string; recordCount: number; counts: Record<string,number>; records?: ImportRecord[] }
export interface Stats { people: number; relationships: number; connections: number; sources: number; pending: number; defaultPersonId: string|null; records: number; unidentified: number; candidates: number; unlinked: number }
export const statusLabels: Record<ReviewStatus,string> = { pending: 'Por revisar', supported: 'Respaldado', disputed: 'En conflicto', rejected: 'Descartado' };
export const typeLabels: Record<RelationType,string> = { parent: 'Progenitor', partner: 'Pareja', godparent: 'Padrino / madrina', close: 'Vínculo cercano' };

export const fieldType = z.enum(['text','longtext','number','boolean','date','select','list','json']);
export type FieldType = z.infer<typeof fieldType>;
export const fieldTypeLabels: Record<FieldType,string> = {text:'Texto corto',longtext:'Nota extensa',number:'Número',boolean:'Sí / No / No se sabe',date:'Fecha',select:'Opciones propias',list:'Lista',json:'Datos estructurados (JSON)'};
const calendarDate = (s:string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
export const fieldInput = z.object({
  label:z.string().trim().min(1,'Dale un nombre al campo.').max(100),
  section:z.string().trim().min(1).max(80).default('Personal'),
  type:fieldType,
  value:z.json(),
  options:z.array(z.string().trim().min(1).max(150)).max(100).default([]),
  notes:z.string().trim().max(10000).default(''),
  source:z.string().trim().max(2000).default(''),
  observedAt:z.string().refine(s=>s===''||calendarDate(s),'La fecha de registro no es válida.').default(''),
  sensitive:z.boolean().default(false),
}).superRefine((f,ctx)=>{
  let valid=true;
  switch(f.type){
    case 'text': case 'longtext': valid=typeof f.value==='string' && f.value.trim().length>0 && f.value.length<=(f.type==='text'?2000:30000);break;
    case 'number':valid=typeof f.value==='number'&&Number.isFinite(f.value);break;
    case 'boolean':valid=f.value===null||typeof f.value==='boolean';break;
    case 'date':valid=typeof f.value==='string'&&calendarDate(f.value);break;
    case 'select':valid=typeof f.value==='string'&&f.options.includes(f.value)&&new Set(f.options).size===f.options.length;break;
    case 'list':valid=Array.isArray(f.value)&&f.value.length>0&&f.value.length<=300&&f.value.every(x=>typeof x==='string'&&x.trim().length>0&&x.length<=2000);break;
    case 'json':valid=f.value!==null&&typeof f.value==='object';break;
  }
  if(!valid)ctx.addIssue({code:'custom',path:['value'],message:'El valor no corresponde al tipo de campo elegido.'});
  if(JSON.stringify(f.value).length>60000)ctx.addIssue({code:'custom',path:['value'],message:'El contenido supera los 60.000 caracteres.'});
});
export type FieldInput = z.infer<typeof fieldInput>;
export const fieldUpdate = fieldInput.safeExtend({version:z.number().int().positive()});
export interface PersonField extends FieldInput {id:string;personId:string;version:number;archived:boolean;createdAt:string;updatedAt:string}
