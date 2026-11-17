import {z} from 'zod';
import {reviewStatus,type ReviewStatus,type GraphData} from './index';
export const entityKind=z.enum(['union','event','place','group']);
export type EntityKind=z.infer<typeof entityKind>;
export type NodeKind=EntityKind|'person';
export const entityLabels:Record<EntityKind,string>={union:'Unión',event:'Acontecimiento',place:'Lugar',group:'Grupo / clan'};
export const connectionType=z.enum(['spouse','union_child','participant','origin','residence','resting_place','member','located_at']);
export type ConnectionType=z.infer<typeof connectionType>;
export const connectionLabels:Record<ConnectionType,string>={spouse:'Participa en la unión',union_child:'Descendencia asociada',participant:'Participa en',origin:'Origen',residence:'Residencia',resting_place:'Lugar de descanso',member:'Pertenece a',located_at:'Ocurrió en'};
export const nodeInput=z.object({
  kind:entityKind,label:z.string().trim().min(2).max(200),
  description:z.string().trim().max(10000).default(''),
  date:z.string().trim().max(100).default(''),endDate:z.string().trim().max(100).default(''),
  category:z.string().trim().max(100).default(''),
  unionState:z.enum(['unknown','ongoing','separated','divorced','widowed','ended']).default('unknown'),
  evidence:z.string().trim().max(5000).default(''),
  status:reviewStatus.default('pending'),
});
export type EntityInput=z.infer<typeof nodeInput>;
export interface GraphEntity extends EntityInput{id:string;version:number;createdAt:string}
export const connectionInput=z.object({sourceId:z.string().uuid(),targetId:z.string().uuid(),type:connectionType,status:reviewStatus.default('pending'),evidence:z.string().trim().max(5000).default('')});
export type ConnectionInput=z.infer<typeof connectionInput>;
export interface GraphConnection extends ConnectionInput{id:string;version:number;citations:string[]}
export const entityCreate=nodeInput.extend({connections:z.array(connectionInput.omit({targetId:true})).max(100).default([])});
export const entityUpdate=nodeInput.extend({version:z.number().int().positive()});
export interface EntityDetail extends GraphEntity{connections:(GraphConnection&{other:{id:string;kind:NodeKind;label:string}})[]}
export interface NetworkData extends GraphData{entities:GraphEntity[];connections:GraphConnection[];overview?:{totalNodes:number;totalPeople:number;isolatedPeople:number;components:number}}
export const allowedConnections:Record<ConnectionType,[NodeKind[],NodeKind[]]>={
  spouse:[['person'],['union']],union_child:[['person'],['union']],participant:[['person'],['event']],
  origin:[['person'],['place']],residence:[['person'],['place']],resting_place:[['person'],['place']],
  member:[['person'],['group']],located_at:[['event','union'],['place']],
};
export const unionStateLabels={unknown:'Sin determinar',ongoing:'Vigente',separated:'Separación',divorced:'Divorcio',widowed:'Viudez',ended:'Finalizada'};
