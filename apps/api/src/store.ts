import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {fieldInput, type FieldInput, type PersonField, type Person, type Relationship, type Assertion, type GraphData, type ReviewStatus } from '../../../packages/contracts/index.js';

export const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export class DomainError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    for(const name of ['001','002','003','004']) this.tx(()=>this.db.exec(readFileSync(fileURLToPath(new URL(`../migrations/${name}.sql`, import.meta.url)), 'utf8')));
  }
  all<T>(sql: string, ...args: (string|number|null)[]): T[] { return this.db.prepare(sql).all(...args) as unknown as T[]; }
  one<T>(sql: string, ...args: (string|number|null)[]): T|undefined { return this.db.prepare(sql).get(...args) as unknown as T|undefined; }
  run(sql: string, ...args: (string|number|null)[]) { return this.db.prepare(sql).run(...args); }
  tx<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const r = fn(); this.db.exec('COMMIT'); return r; } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  audit(action: string, id: string, before: unknown, after: unknown) {
    this.run('INSERT INTO audit(id,action,entityId,beforeValue,afterValue) VALUES(?,?,?,?,?)', randomUUID(), action, id, JSON.stringify(before ?? null), JSON.stringify(after ?? null));
  }
  request<T>(key: string, operation: string, body: unknown, fn: () => T): T {
    return this.tx(() => {
      const bodyHash = hash(JSON.stringify(body));
      const prev = this.one<{bodyHash:string; response:string}>('SELECT * FROM requests WHERE key=? AND operation=?', key, operation);
      if (prev) { if (prev.bodyHash !== bodyHash) throw new DomainError(409, 'Esta clave de operación ya se usó con otros datos.'); return JSON.parse(prev.response); }
      const result = fn();
      this.run('INSERT INTO requests(key,operation,bodyHash,response) VALUES(?,?,?,?)', key, operation, bodyHash, JSON.stringify(result));
      return result;
    });
  }
  person(id: string) { const p = this.one<Person>('SELECT * FROM people WHERE id=?', id); if (!p) throw new DomainError(404, 'No se encontró la persona.'); return p; }
  people(query = '', limit = 100, offset = 0) {
    const q = `%${normalize(query).replace(/[!%_]/g, '!$&')}%`;
    return { items: this.all<Person>("SELECT * FROM people WHERE searchName LIKE ? ESCAPE '!' ORDER BY searchName,id LIMIT ? OFFSET ?", q, limit, offset), total: this.one<{n:number}>("SELECT count(*) n FROM people WHERE searchName LIKE ? ESCAPE '!'", q)!.n };
  }
  createPerson(input: {name:string;summary:string;lifeStatus:Person['lifeStatus']}, sourceRow: number|null = null) {
    const id = randomUUID();
    this.run('INSERT INTO people(id,name,searchName,summary,lifeStatus,sourceRow) VALUES(?,?,?,?,?,?)', id, input.name, normalize(input.name), input.summary, input.lifeStatus, sourceRow);
    const p = this.person(id); this.audit('person.created', id, null, p); return p;
  }
  updatePerson(id: string, input: {name:string;summary:string;lifeStatus:Person['lifeStatus'];version:number}) {
    const p = this.person(id); if(p.version !== input.version) throw new DomainError(409, 'La ficha cambió. Vuelve a abrirla antes de guardar.');
    this.run('UPDATE people SET name=?,searchName=?,summary=?,lifeStatus=?,version=version+1 WHERE id=?', input.name, normalize(input.name), input.summary, input.lifeStatus, id);
    const next = this.person(id); this.audit('person.updated', id, p, next); return next;
  }
  detail(id: string) {
    const p = this.person(id);
    return { ...p, fields:this.fields(id,true), assertions: this.all<Assertion>('SELECT * FROM assertions WHERE personId=? ORDER BY createdAt,id', id),
      relationships: this.all<Relationship>('SELECT * FROM relationships WHERE sourceId=? OR targetId=? ORDER BY type,id', id,id)
        .map(r => ({ ...r, other: this.person(r.sourceId===id ? r.targetId : r.sourceId) })) };
  }
  fields(personId?:string,includeArchived=false):PersonField[] {
    const rows=this.all<{valueJson:string;optionsJson:string;sensitive:number;archived:number} & Omit<PersonField,'value'|'options'|'sensitive'|'archived'>>(`SELECT * FROM personFields WHERE 1=1 ${personId?'AND personId=?':''} ${includeArchived?'':'AND archived=0'} ORDER BY section,createdAt,id`,...(personId?[personId]:[]));
    return rows.map(({valueJson,optionsJson,sensitive,archived,...rest})=>({...rest,value:JSON.parse(valueJson),options:JSON.parse(optionsJson),sensitive:!!sensitive,archived:!!archived}));
  }
  field(personId:string,id:string) {
    this.person(personId);
    const f=this.fields(personId,true).find(f=>f.id===id);
    if(!f)throw new DomainError(404,'No se encontró este campo en la ficha.');
    return f;
  }
  saveField(personId:string,input:FieldInput,id?:string,version?:number) {
    this.person(personId);const f=fieldInput.parse(input);
    const previous=id?this.field(personId,id):null;
    if(previous&&(previous.version!==version||previous.archived))throw new DomainError(409,'El campo cambió o se archivó. Actualiza la ficha antes de guardar.');
    const fieldId=id??randomUUID();
    const params=[f.label,f.section,f.type,JSON.stringify(f.value),JSON.stringify(f.options),f.notes,f.source,f.observedAt,Number(f.sensitive)];
    if(previous)this.run('UPDATE personFields SET label=?,section=?,type=?,valueJson=?,optionsJson=?,notes=?,source=?,observedAt=?,sensitive=?,version=version+1,updatedAt=CURRENT_TIMESTAMP WHERE id=?',...params,fieldId);
    else this.run('INSERT INTO personFields(label,section,type,valueJson,optionsJson,notes,source,observedAt,sensitive,id,personId) VALUES(?,?,?,?,?,?,?,?,?,?,?)',...params,fieldId,personId);
    const result=this.field(personId,fieldId);this.audit(previous?'field.updated':'field.created',fieldId,previous,result);return result;
  }
  archiveField(personId:string,id:string,version:number,archived:boolean) {
    const previous=this.field(personId,id);
    if(previous.version!==version)throw new DomainError(409,'El campo cambió. Actualiza la ficha antes de guardar.');
    this.run('UPDATE personFields SET archived=?,version=version+1,updatedAt=CURRENT_TIMESTAMP WHERE id=?',Number(archived),id);
    const result=this.field(personId,id);this.audit(archived?'field.archived':'field.restored',id,previous,result);return result;
  }
  addAssertion(input: {personId:string;property:string;value:string;evidence:string;status:ReviewStatus}, sourceId: string|null=null, sourceRow:number|null=null, importKey:string|null=null) {
    this.person(input.personId);
    if(importKey) { const prev = this.one<Assertion>('SELECT * FROM assertions WHERE importKey=?',importKey); if(prev) return prev; }
    const id = randomUUID();
    this.run('INSERT INTO assertions(id,personId,property,value,evidence,status,sourceId,sourceRow,importKey) VALUES(?,?,?,?,?,?,?,?,?)',id,input.personId,input.property,input.value,input.evidence,input.status,sourceId,sourceRow,importKey);
    const a=this.one<Assertion>('SELECT * FROM assertions WHERE id=?',id)!; this.audit('assertion.created', id,null,a); return a;
  }
  checkCycle(sourceId:string,targetId:string,exclude='') {
    const cycle = this.one(`WITH RECURSIVE descendants(id) AS (SELECT ? UNION SELECT r.targetId FROM relationships r JOIN descendants d ON r.sourceId=d.id WHERE r.type='parent' AND r.status!='rejected' AND r.id!=?) SELECT id FROM descendants WHERE id=? LIMIT 1`,targetId,exclude,sourceId);
    if(cycle) throw new DomainError(409,'Este vínculo crearía un ciclo de ascendencia: una persona no puede ser su propio antepasado.');
  }
  addRelationship(input: Omit<Relationship,'id'|'sourceRow'|'version'>, sourceId:string|null=null, sourceRow:number|null=null) {
    let {sourceId:from,targetId:to}=input;
    this.person(from); this.person(to);
    if(from===to) throw new DomainError(400,'Selecciona dos personas diferentes.');
    if(input.type==='partner' || input.type==='close') [from,to]=[from,to].sort();
    const prev=this.one<Relationship>('SELECT * FROM relationships WHERE sourceId=? AND targetId=? AND type=? AND context=?',from,to,input.type,input.context);
    if(prev) {
      // A second citation is evidence, not a duplicate relationship or an implicit status change.
      this.run('INSERT OR IGNORE INTO relationshipEvidence(id,relationshipId,text,sourceId,sourceRow) VALUES(?,?,?,?,?)',randomUUID(),prev.id,input.evidence,sourceId,sourceRow);
      return prev;
    }
    if(input.type==='parent' && input.status!=='rejected') this.checkCycle(from,to);
    const id=randomUUID();
    this.run('INSERT INTO relationships(id,sourceId,targetId,type,status,context,evidence,sourceRow) VALUES(?,?,?,?,?,?,?,?)',id,from,to,input.type,input.status,input.context,input.evidence,sourceRow);
    this.run('INSERT INTO relationshipEvidence(id,relationshipId,text,sourceId,sourceRow) VALUES(?,?,?,?,?)',randomUUID(),id,input.evidence,sourceId,sourceRow);
    const result=this.one<Relationship>('SELECT * FROM relationships WHERE id=?',id)!; this.audit('relationship.created',id,null,result); return result;
  }
  review(kind:'assertions'|'relationships',id:string,status:ReviewStatus,version?:number) {
    const before=this.one<Relationship|Assertion>(`SELECT * FROM ${kind} WHERE id=?`,id);
    if(!before) throw new DomainError(404,'No se encontró el elemento.');
    if(version===undefined || (before as Relationship).version!==version) throw new DomainError(409,'El elemento cambió. Actualiza la vista antes de revisarlo.');
    if(kind==='relationships') { const r=before as Relationship; if(r.type==='parent' && status!=='rejected') this.checkCycle(r.sourceId,r.targetId,id); }
    this.run(`UPDATE ${kind} SET status=?,version=version+1 WHERE id=?`,status,id);
    const after=this.one(`SELECT * FROM ${kind} WHERE id=?`,id); this.audit(`${kind}.reviewed`,id,before,after); return after;
  }
  graph(id:string,depth:number,includePending:boolean,type:string) : GraphData {
    this.person(id);
    const allowed=this.all<Relationship>(`SELECT * FROM relationships WHERE status ${includePending ? "IN ('pending','supported','disputed')" : "='supported'"} ${type==='all'?'':"AND type='parent'"} ORDER BY id`);
    const ids=new Set([id]); let frontier=[id]; let truncated=false;
    for(let level=0;level<depth;level++) {
      const next:string[]=[];
      for(const r of allowed) for(const [a,b] of [[r.sourceId,r.targetId],[r.targetId,r.sourceId]]) {
        if(frontier.includes(a) && !ids.has(b)) { if(ids.size>=100){truncated=true;continue;} ids.add(b);next.push(b); }
      }
      frontier=next;
    }
    return {people:[...ids].map(x=>this.person(x)),relationships:allowed.filter(r=>ids.has(r.sourceId)&&ids.has(r.targetId)),truncated};
  }
  stats() {
    const count=(table:string,where='')=>this.one<{n:number}>(`SELECT count(*) n FROM ${table} ${where}`)!.n;
    return { people:count('people'),relationships:count('relationships',"WHERE status!='rejected'"), connections:count('graphConnections',"WHERE status!='rejected'"), sources:count('sources'),
      pending:count('relationships',"WHERE status IN ('pending','disputed')")+count('assertions',"WHERE status IN ('pending','disputed')")+count('graphConnections',"WHERE status IN ('pending','disputed')")+count('graphNodes',"WHERE kind!='person' AND status IN ('pending','disputed')"),
      records:count('importRecords'),unidentified:count('importRecords',"WHERE classification='review' AND personId IS NULL"),candidates:count('importRecords',"WHERE classification='candidate' AND personId IS NULL"),
      unlinked:count('people',"WHERE NOT EXISTS(SELECT 1 FROM relationships r WHERE (r.sourceId=people.id OR r.targetId=people.id) AND r.status!='rejected') AND NOT EXISTS(SELECT 1 FROM graphConnections c JOIN graphNodes n ON n.id=c.targetId WHERE c.sourceId=people.id AND c.status!='rejected' AND n.status!='rejected')"),
      defaultPersonId:this.one<{id:string}>('SELECT id FROM people WHERE sourceRow=154 ORDER BY createdAt LIMIT 1')?.id ?? this.one<{id:string}>('SELECT id FROM people ORDER BY createdAt LIMIT 1')?.id ?? null };
  }
  close(){this.db.close();}
}
