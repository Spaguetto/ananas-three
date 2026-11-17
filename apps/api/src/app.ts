import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z, ZodError } from 'zod';
import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Store, DomainError } from './store.js';
import { getBatch, previewImport, applyBatch, incorporateRecord, linkRecord } from './importer.js';
import { assertionInput, personInput, personUpdate, relationshipInput, reviewStatus, fieldInput, fieldUpdate } from '../../../packages/contracts/index.js';
import {NetworkStore} from './network.js';
import {entityCreate,entityUpdate,entityKind,connectionInput} from '../../../packages/contracts/network.js';
import {relationshipRecovery,applyRelationshipRecovery} from './recoverRelationships.js';
import {platePeople,savePlate,platePath} from './plates.js';
import {evidenceInput,relationshipSubmission} from '../../../packages/contracts/evidence.js';
import {addEvidence,prepareEvidenceFiles,relationshipEvidence} from './evidence.js';

export async function buildApp(store:Store,documentRoot:string){
  const app=Fastify({logger:false,bodyLimit:2*1024*1024});
  const network=new NetworkStore(store);
  const origins=new Set(['http://127.0.0.1:5173','http://localhost:5173']);
  await app.register(cors,{origin:[...origins],methods:['GET','POST','PATCH'],allowedHeaders:['Content-Type','Idempotency-Key']});
  app.addHook('onRequest',async(req)=>{
    if(req.headers.origin && !origins.has(req.headers.origin))throw new DomainError(403,'Origen no autorizado para el archivo local.');
    const host=(req.headers.host??'').split(':')[0];
    if(!['127.0.0.1','localhost'].includes(host))throw new DomainError(403,'Este servidor admite únicamente acceso local.');
  });
  app.setErrorHandler((error,req,reply)=>{
    if(error instanceof ZodError)return reply.code(400).send({message:error.issues.map(x=>x.message).join(' ')});
    const status=error instanceof DomainError?error.statusCode:((error as {statusCode?:number}).statusCode??500);
    if(status>=500)console.error(error);
    return reply.code(status).send({message:status>=500?'No se pudo completar la operación. Los cambios de la transacción se revirtieron.':error instanceof Error?error.message:'Solicitud no válida.'});
  });
  const key=(headers:Record<string,unknown>)=>z.string().min(8).max(200).parse(headers['idempotency-key']);
  const id=(params:unknown)=>z.object({id:z.string().uuid()}).parse(params).id;
  app.get('/api/health',()=>({status:'ok',storage:'sqlite',mode:'local'}));
  app.get('/api/stats',()=>store.stats());
  app.get('/api/people',req=>{const q=z.object({query:z.string().max(200).default(''),limit:z.coerce.number().int().min(1).max(500).default(100),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);return store.people(q.query,q.limit,q.offset);});
  app.get('/api/people/:id',req=>store.detail(id(req.params)));
  app.post('/api/plates/people',req=>{const body=z.object({ids:z.array(z.string().uuid()).max(500)}).parse(req.body);return platePeople(store,body.ids);});
  app.post('/api/plates/export',{bodyLimit:45*1024*1024},req=>{const body=z.object({title:z.string().max(100),base64:z.string().min(60).max(45_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).parse(req.body);return store.request(key(req.headers),'plate.export',body,()=>{const result=savePlate(documentRoot,body.base64,body.title);store.audit('plate.exported',result.hash,null,{filename:result.filename,path:result.path,width:result.width,height:result.height});return result;});});
  app.get('/api/plates/files/:hash',(req,reply)=>{const {hash}=z.object({hash:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.params);const q=z.object({download:z.enum(['1']).optional(),name:z.string().max(100).optional()}).parse(req.query);const path=platePath(documentRoot,hash);reply.header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox");if(q.download)reply.header('Content-Disposition',`attachment; filename="${(q.name??'arbol-familiar.png').replace(/[^a-zA-Z0-9 ._-]/g,'')}"`);return reply.type('image/png').send(createReadStream(path));});
  app.get('/api/people/:id/contexts',req=>network.personContexts(id(req.params)));
  app.get('/api/network',req=>{const q=z.object({includePending:z.enum(['true','false']).default('true'),context:z.enum(['true','false']).default('true')}).parse(req.query);return network.overview(q.includePending==='true',q.context==='true');});
  app.get('/api/entities',req=>{const q=z.object({kind:entityKind.optional()}).parse(req.query);return network.entities(q.kind);});
  app.get('/api/entities/:id',req=>network.detail(id(req.params)));
  app.post('/api/entities',req=>{const body=entityCreate.parse(req.body);return store.request(key(req.headers),'entity.create',body,()=>{const node=network.save(body);for(const link of body.connections)network.link({...link,targetId:node.id});return network.detail(node.id);});});
  app.patch('/api/entities/:id',req=>{const body=entityUpdate.parse(req.body);const nid=id(req.params);return store.request(key(req.headers),`entity.update:${nid}`,body,()=>{network.save(body,nid,body.version);return network.detail(nid);});});
  app.post('/api/connections',req=>{const body=connectionInput.parse(req.body);return store.request(key(req.headers),'connection.create',body,()=>network.link(body));});
  app.patch('/api/connections/:id',req=>{const body=z.object({status:reviewStatus,version:z.number().int().positive()}).parse(req.body);const cid=id(req.params);return store.request(key(req.headers),`connection.review:${cid}`,body,()=>network.reviewConnection(cid,body.status,body.version));});
  app.get('/api/network/:id',req=>{const q=z.object({depth:z.coerce.number().int().min(1).max(5).default(2),includePending:z.enum(['true','false']).default('true'),context:z.enum(['true','false']).default('true')}).parse(req.query);return network.around(id(req.params),q.depth,q.includePending==='true',q.context==='true');});
  app.get('/api/people/:id/fields',req=>{const pid=id(req.params);store.person(pid);return store.fields(pid,true);});
  app.post('/api/people/:id/fields',req=>{const pid=id(req.params);const body=fieldInput.parse(req.body);return store.request(key(req.headers),`field.create:${pid}`,body,()=>store.saveField(pid,body));});
  app.patch('/api/people/:id/fields/:fieldId',req=>{
    const p=z.object({id:z.string().uuid(),fieldId:z.string().uuid()}).parse(req.params);const body=fieldUpdate.parse(req.body);
    return store.request(key(req.headers),`field.update:${p.id}:${p.fieldId}`,body,()=>store.saveField(p.id,body,p.fieldId,body.version));
  });
  app.patch('/api/people/:id/fields/:fieldId/archive',req=>{
    const p=z.object({id:z.string().uuid(),fieldId:z.string().uuid()}).parse(req.params);const body=z.object({version:z.number().int().positive(),archived:z.boolean()}).parse(req.body);
    return store.request(key(req.headers),`field.archive:${p.id}:${p.fieldId}`,body,()=>store.archiveField(p.id,p.fieldId,body.version,body.archived));
  });
  app.post('/api/people',req=>{const body=personInput.parse(req.body);return store.request(key(req.headers),'people.create',body,()=>store.createPerson(body));});
  app.patch('/api/people/:id',req=>{const body=personUpdate.parse(req.body);const pid=id(req.params);return store.request(key(req.headers),`people.update:${pid}`,body,()=>store.updatePerson(pid,body));});
  app.get('/api/people/:id/graph',req=>{const q=z.object({depth:z.coerce.number().int().min(1).max(5).default(2),includePending:z.enum(['true','false']).default('true'),type:z.enum(['all','parent']).default('parent')}).parse(req.query);return store.graph(id(req.params),q.depth,q.includePending==='true',q.type);});
  app.post('/api/relationships',{bodyLimit:36*1024*1024},req=>{
    const body=relationshipSubmission.parse(req.body);
    return store.request(key(req.headers),'relationship.create',body,()=>{
      const files=prepareEvidenceFiles(body.files);
      const relation=store.addRelationship({...body,evidence:body.evidence||'Archivos adjuntos'});
      addEvidence(store,documentRoot,relation.id,body.evidence,files);
      return relation;
    });
  });
  app.get('/api/relationships/:id/evidence',req=>relationshipEvidence(store,id(req.params)));
  app.post('/api/relationships/:id/evidence',{bodyLimit:36*1024*1024},req=>{
    const rid=id(req.params),body=evidenceInput.parse(req.body);
    return store.request(key(req.headers),`relationship.evidence:${rid}`,body,()=>addEvidence(store,documentRoot,rid,body.evidence,prepareEvidenceFiles(body.files)));
  });
  app.post('/api/assertions',req=>{const body=assertionInput.parse(req.body);return store.request(key(req.headers),'assertion.create',body,()=>store.addAssertion(body));});
  app.get('/api/research',()=>({
    relationships:store.all("SELECT r.*,p.name sourceName,t.name targetName FROM relationships r JOIN people p ON p.id=r.sourceId JOIN people t ON t.id=r.targetId WHERE r.status IN ('pending','disputed') ORDER BY r.type,r.id LIMIT 200"),
    assertions:store.all("SELECT a.*,p.name personName FROM assertions a JOIN people p ON p.id=a.personId WHERE a.status='disputed' ORDER BY a.id LIMIT 200")
  }));
  app.patch('/api/review/:kind/:id',req=>{
    const p=z.object({kind:z.enum(['assertions','relationships']),id:z.string().uuid()}).parse(req.params);
    const body=z.object({status:reviewStatus,version:z.number().int().positive()}).parse(req.body);
    return store.request(key(req.headers),`review:${p.kind}:${p.id}`,body,()=>store.review(p.kind,p.id,body.status,body.version));
  });
  app.get('/api/imports',()=>store.all<{id:string}>('SELECT id FROM imports ORDER BY rowid DESC').map(b=>getBatch(store,b.id)));
  app.get('/api/imports/:id',req=>getBatch(store,id(req.params),true));
  app.get('/api/imports/:id/relationships',req=>relationshipRecovery(store,id(req.params)));
  app.post('/api/imports/:id/relationships/apply',req=>{const bid=id(req.params);return store.request(key(req.headers),`relationships.recover:${bid}`,{},()=>applyRelationshipRecovery(store,bid));});
  app.post('/api/imports/preview',req=>{const body=z.object({name:z.string().min(1).max(200),base64:z.string().min(1).max(1500000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).parse(req.body);return store.request(key(req.headers),'imports.preview',body,()=>previewImport(store,body.name,Buffer.from(body.base64,'base64'),documentRoot));});
  app.post('/api/imports/:id/apply',req=>{const bid=id(req.params);return store.request(key(req.headers),`import.apply:${bid}`,{},()=>applyBatch(store,bid));});
  app.post('/api/import-records/:id/incorporate',req=>{const rid=id(req.params);const body=z.object({name:z.string().trim().min(2).max(200)}).parse(req.body);return store.request(key(req.headers),`record.incorporate:${rid}`,body,()=>incorporateRecord(store,rid,body.name));});
  app.post('/api/import-records/:id/link',req=>{const rid=id(req.params);const body=z.object({personId:z.string().uuid()}).parse(req.body);return store.request(key(req.headers),`record.link:${rid}`,body,()=>linkRecord(store,rid,body.personId));});
  app.get('/api/sources',()=>store.all('SELECT id,name,hash,mime,bytes FROM sources ORDER BY name'));
  app.get('/api/sources/:id/content',(req,reply)=>{
    const q=z.object({download:z.enum(['1']).optional(),name:z.string().max(255).optional()}).parse(req.query);
    const source=store.one<{path:string;mime:string;name:string}>('SELECT * FROM sources WHERE id=?',id(req.params));
    if(!source)throw new DomainError(404,'No se encontró la fuente.');
    const root=realpathSync(documentRoot);const path=resolve(root,source.path);
    if(!path.startsWith(root+sep)||!existsSync(path))throw new DomainError(404,'El archivo no está disponible en la raíz documental.');
    const canonical=realpathSync(path);if(!canonical.startsWith(root+sep))throw new DomainError(403,'Ruta documental no permitida.');
    reply.header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox");
    const inline=['image/png','image/jpeg','image/gif','image/webp','application/pdf','text/plain','text/csv'].includes(source.mime);
    const filename=q.name??source.name;
    const encoded=encodeURIComponent(filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
    reply.header('Content-Disposition',`${q.download||!inline?'attachment':'inline'}; filename="${filename.replace(/[^a-zA-Z0-9 ._-]/g,'_')}"; filename*=UTF-8''${encoded}`);
    reply.type(`${source.mime}${source.mime.startsWith('text/')?'; charset=utf-8':''}`);return reply.send(createReadStream(canonical));
  });
  app.get('/api/export',(_,reply)=>{
    reply.header('Content-Disposition','attachment; filename="archivo-familiar.json"');
    return {format:'entre-ramas',version:4,exportedAt:new Date().toISOString(),people:store.all('SELECT * FROM people'),fields:store.fields(undefined,true),entities:network.entities(),connections:network.connections(),relationships:store.all('SELECT * FROM relationships'),assertions:store.all('SELECT * FROM assertions'),evidence:store.all('SELECT * FROM relationshipEvidence'),evidenceFiles:store.all('SELECT * FROM relationshipEvidenceFiles'),sources:store.all('SELECT * FROM sources'),imports:store.all('SELECT * FROM imports'),importRecords:store.all('SELECT * FROM importRecords'),audit:store.all('SELECT * FROM audit')};
  });
  return app;
}
