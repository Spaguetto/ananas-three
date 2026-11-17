CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,hash TEXT UNIQUE NOT NULL,path TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS people(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, searchName TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
 lifeStatus TEXT NOT NULL DEFAULT 'unknown' CHECK(lifeStatus IN ('unknown','living','deceased')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','supported','disputed','rejected')),
 version INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sourceRow INTEGER
);
CREATE INDEX IF NOT EXISTS people_search ON people(searchName);
CREATE TABLE IF NOT EXISTS assertions(
 id TEXT PRIMARY KEY, personId TEXT NOT NULL REFERENCES people(id), property TEXT NOT NULL,value TEXT NOT NULL,evidence TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','supported','disputed','rejected')),
 sourceId TEXT REFERENCES sources(id),sourceRow INTEGER,importKey TEXT UNIQUE,version INTEGER NOT NULL DEFAULT 1,createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS assertions_person ON assertions(personId);
CREATE TABLE IF NOT EXISTS relationships(
 id TEXT PRIMARY KEY,sourceId TEXT NOT NULL REFERENCES people(id),targetId TEXT NOT NULL REFERENCES people(id),
 type TEXT NOT NULL CHECK(type IN ('parent','partner','godparent','close')),status TEXT NOT NULL CHECK(status IN ('pending','supported','disputed','rejected')),
 context TEXT NOT NULL DEFAULT '',evidence TEXT NOT NULL,sourceRow INTEGER,version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(sourceId,targetId,type,context),CHECK(sourceId!=targetId)
);
CREATE INDEX IF NOT EXISTS relations_source ON relationships(sourceId,type,status);
CREATE INDEX IF NOT EXISTS relations_target ON relationships(targetId,type,status);
CREATE TABLE IF NOT EXISTS relationshipEvidence(id TEXT PRIMARY KEY,relationshipId TEXT NOT NULL REFERENCES relationships(id),text TEXT NOT NULL,sourceId TEXT REFERENCES sources(id),sourceRow INTEGER,UNIQUE(relationshipId,text));
CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,sourceId TEXT NOT NULL REFERENCES sources(id),hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'preview',recordCount INTEGER NOT NULL,parserVersion TEXT NOT NULL DEFAULT '1');
CREATE TABLE IF NOT EXISTS importRecords(
 id TEXT PRIMARY KEY,batchId TEXT NOT NULL REFERENCES imports(id),row INTEGER NOT NULL,label TEXT NOT NULL,description TEXT NOT NULL,tags TEXT NOT NULL,raw TEXT NOT NULL,
 classification TEXT NOT NULL,personId TEXT REFERENCES people(id),decision TEXT NOT NULL DEFAULT 'pending',UNIQUE(batchId,row)
);
CREATE INDEX IF NOT EXISTS import_records_batch ON importRecords(batchId);
CREATE TABLE IF NOT EXISTS requests(key TEXT NOT NULL,operation TEXT NOT NULL,bodyHash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(key,operation));
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,action TEXT NOT NULL,entityId TEXT NOT NULL,beforeValue TEXT NOT NULL,afterValue TEXT NOT NULL,actor TEXT NOT NULL DEFAULT 'local',createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
