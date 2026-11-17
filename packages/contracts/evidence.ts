import {z} from 'zod';
import {relationshipInput} from './index';

export const MAX_EVIDENCE_FILES=10;
export const MAX_EVIDENCE_FILE_BYTES=10*1024*1024;
export const MAX_EVIDENCE_TOTAL_BYTES=25*1024*1024;
export const evidenceFileInput=z.object({
  name:z.string().trim().min(1).max(255).refine(name=>!/[\x00-\x1f\x7f]/.test(name),'Nombre de archivo no válido.'),
  base64:z.string().min(4).max(4*Math.ceil(MAX_EVIDENCE_FILE_BYTES/3)).regex(/^[A-Za-z0-9+/]+={0,2}$/,'El archivo no está codificado correctamente.'),
});
const fields={evidence:z.string().trim().max(5000).default(''),files:z.array(evidenceFileInput).max(MAX_EVIDENCE_FILES).default([])};
const hasEvidence=(body:{evidence:string;files:unknown[]})=>(body.evidence.length>=3||body.files.length>0)&&(!body.evidence||body.evidence.length>=3);
const validation={message:'Escribe una nota de al menos 3 caracteres o adjunta un archivo.',path:['evidence']};
export const evidenceInput=z.object(fields).refine(hasEvidence,validation);
export const relationshipSubmission=relationshipInput.extend(fields).refine(hasEvidence,validation);
export type EvidenceFileInput=z.infer<typeof evidenceFileInput>;
export interface EvidenceFile {id:string;name:string;mime:string;bytes:number}
export interface RelationshipEvidence {id:string;text:string;sourceId:string|null;sourceRow:number|null;files:EvidenceFile[]}
export const previewableImage=(mime:string)=>['image/png','image/jpeg','image/webp','image/gif'].includes(mime);
