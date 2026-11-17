CREATE TABLE IF NOT EXISTS personFields(
 id TEXT PRIMARY KEY,
 personId TEXT NOT NULL REFERENCES people(id),
 label TEXT NOT NULL, section TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('text','longtext','number','boolean','date','select','list','json')),
 valueJson TEXT NOT NULL CHECK(json_valid(valueJson)),
 optionsJson TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(optionsJson)),
 notes TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', observedAt TEXT NOT NULL DEFAULT '',
 sensitive INTEGER NOT NULL DEFAULT 0 CHECK(sensitive IN (0,1)),
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS fields_person_section ON personFields(personId,archived,section);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(2);
