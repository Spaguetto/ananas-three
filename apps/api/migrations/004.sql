-- A citation may contain multiple original files without changing older citations.
CREATE TABLE IF NOT EXISTS relationshipEvidenceFiles(
 evidenceId TEXT NOT NULL REFERENCES relationshipEvidence(id),
 sourceId TEXT NOT NULL REFERENCES sources(id),
 name TEXT NOT NULL,
 createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(evidenceId,sourceId)
);
CREATE INDEX IF NOT EXISTS evidence_files_source ON relationshipEvidenceFiles(sourceId);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(4);
