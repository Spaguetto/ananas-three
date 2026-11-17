import {GitBranch} from 'lucide-react';
import {typeLabels} from '../../../packages/contracts';
export interface RecoveryPreview{
  supported:boolean;newCount:number;
  proposals:{sourceName:string;targetName:string;type:'parent'|'partner'|'godparent';sourceRow:number;evidence:string;existing:boolean}[];
  missing:{row:number;reason:string}[];notes:{row:number;reason:string}[];
}
export default function RelationshipRecovery({data,busy,onApply}:{data:RecoveryPreview;busy:boolean;onApply:()=>void}){
  if(!data.supported)return null;
  return <section className="recovery-section" aria-label="Relaciones recuperadas del texto"><h3>Los vínculos escritos en las fuentes</h3><p>El CSV no incluye los extremos de las líneas de Miro. Estas propuestas se basan en los parentescos que sí aparecen en sus transcripciones. Conservan su fuente y requieren cotejar las identidades.</p><button className="button secondary" disabled={busy||!data.newCount} onClick={onApply}><GitBranch size={16}/>{busy?'Incorporando…':data.newCount?`Incorporar ${data.newCount} propuestas de vínculo`:'Propuestas incorporadas'}</button><details><summary>Ver {data.proposals.length} relaciones documentadas</summary>{data.proposals.map((p,i)=><article className="recovery-proposal" key={i}><strong>{p.sourceName} → {p.targetName}</strong><p>{typeLabels[p.type]} · registro {p.sourceRow} · {p.existing?'Ya incorporada':'Nueva propuesta'}</p><details><summary>Leer transcripción y criterio</summary><p>{p.evidence}</p></details></article>)}</details><details><summary>Qué falta identificar o cotejar ({data.notes.length+data.missing.length} notas)</summary>{[...data.missing,...data.notes].map((n,i)=><p className="recovery-proposal" key={i}><strong>Registro {n.row}.</strong> {n.reason}</p>)}</details></section>;
}
