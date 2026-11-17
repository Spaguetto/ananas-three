-- A shared identity registry permits real foreign keys on heterogeneous graph edges.
CREATE TABLE IF NOT EXISTS graphNodes(
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('person','union','event','place','group')),
 label TEXT NOT NULL,
 personId TEXT UNIQUE REFERENCES people(id),
 description TEXT NOT NULL DEFAULT '', date TEXT NOT NULL DEFAULT '',endDate TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT '',unionState TEXT NOT NULL DEFAULT 'unknown',evidence TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','supported','disputed','rejected')),
 version INTEGER NOT NULL DEFAULT 1,createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((kind='person' AND personId=id) OR (kind!='person' AND personId IS NULL))
);
CREATE INDEX IF NOT EXISTS graph_nodes_kind ON graphNodes(kind,status);
INSERT OR IGNORE INTO graphNodes(id,kind,label,personId,status) SELECT id,'person',name,id,status FROM people;
CREATE TRIGGER IF NOT EXISTS graph_person_created AFTER INSERT ON people BEGIN
 INSERT INTO graphNodes(id,kind,label,personId,status) VALUES(NEW.id,'person',NEW.name,NEW.id,NEW.status);
END;
CREATE TRIGGER IF NOT EXISTS graph_person_updated AFTER UPDATE OF name,status ON people BEGIN
 UPDATE graphNodes SET label=NEW.name,status=NEW.status,version=version+1 WHERE id=NEW.id;
END;
CREATE TABLE IF NOT EXISTS graphConnections(
 id TEXT PRIMARY KEY,sourceId TEXT NOT NULL REFERENCES graphNodes(id),targetId TEXT NOT NULL REFERENCES graphNodes(id),
 type TEXT NOT NULL CHECK(type IN ('spouse','union_child','participant','origin','residence','resting_place','member','located_at')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','supported','disputed','rejected')),
 evidence TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(sourceId,targetId,type),CHECK(sourceId!=targetId)
);
CREATE INDEX IF NOT EXISTS graph_connections_source ON graphConnections(sourceId,status);
CREATE INDEX IF NOT EXISTS graph_connections_target ON graphConnections(targetId,status);
CREATE TABLE IF NOT EXISTS graphCitations(id TEXT PRIMARY KEY,connectionId TEXT NOT NULL REFERENCES graphConnections(id),text TEXT NOT NULL,UNIQUE(connectionId,text));
INSERT OR IGNORE INTO schema_migrations(version) VALUES(3);
