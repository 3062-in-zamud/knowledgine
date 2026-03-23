import type { Migration } from "../migrator.js";

const SPEC_ALIGNMENT_SQL = `
-- ① bi-temporal カラム改名 (relations)
ALTER TABLE relations RENAME COLUMN valid_from TO valid_at;
ALTER TABLE relations RENAME COLUMN valid_to TO invalid_at;
ALTER TABLE relations RENAME COLUMN superseded_at TO superseded_by;
ALTER TABLE relations ADD COLUMN expired_at TEXT;
ALTER TABLE relations ADD COLUMN source_event_id TEXT;

-- bi-temporal カラム改名 (observations)
ALTER TABLE observations RENAME COLUMN valid_from TO valid_at;
ALTER TABLE observations RENAME COLUMN valid_to TO invalid_at;
ALTER TABLE observations RENAME COLUMN superseded_at TO superseded_by;
ALTER TABLE observations ADD COLUMN expired_at TEXT;
ALTER TABLE observations ADD COLUMN source_event_id TEXT;

-- VIEW 再作成
DROP VIEW IF EXISTS active_relations;
DROP VIEW IF EXISTS active_observations;
CREATE VIEW active_relations AS
  SELECT * FROM relations WHERE (invalid_at IS NULL) AND (expired_at IS NULL);
CREATE VIEW active_observations AS
  SELECT * FROM observations WHERE (invalid_at IS NULL) AND (expired_at IS NULL);

-- インデックス再作成
DROP INDEX IF EXISTS idx_relations_valid_to;
DROP INDEX IF EXISTS idx_relations_superseded;
DROP INDEX IF EXISTS idx_observations_valid_to;
DROP INDEX IF EXISTS idx_observations_superseded;
CREATE INDEX idx_relations_invalid_at ON relations(invalid_at);
CREATE INDEX idx_relations_superseded_by ON relations(superseded_by);
CREATE INDEX idx_observations_invalid_at ON observations(invalid_at);
CREATE INDEX idx_observations_superseded_by ON observations(superseded_by);

-- ② memory_entries scope
ALTER TABLE memory_entries ADD COLUMN scope TEXT DEFAULT 'project';

-- ③ provenance_links (新規)
CREATE TABLE provenance_links (
  id TEXT PRIMARY KEY,
  from_entity_uri TEXT NOT NULL,
  to_entity_uri TEXT NOT NULL,
  relation TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- ④ provenance テーブル再構築
CREATE TABLE provenance_new (
  id TEXT PRIMARY KEY,
  entity_uri TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  agent TEXT,
  source_uri TEXT,
  generated_at TEXT NOT NULL,
  metadata TEXT
);
INSERT INTO provenance_new (id, entity_uri, activity_type, agent, source_uri, generated_at, metadata)
  SELECT CAST(id AS TEXT), entity_uri, activity_type, agent,
         COALESCE(input_uris, ''), started_at, metadata_json
  FROM provenance;
DROP TABLE provenance;
ALTER TABLE provenance_new RENAME TO provenance;
CREATE INDEX idx_provenance_entity ON provenance(entity_uri);
CREATE INDEX idx_provenance_activity ON provenance(activity_type);

-- ⑤ file_timeline 再構築
CREATE TABLE file_timeline_new (
  file_path TEXT NOT NULL,
  event_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  change_type TEXT NOT NULL
);
INSERT INTO file_timeline_new (file_path, event_id, changed_at, change_type)
  SELECT file_path, CAST(COALESCE(event_id, '') AS TEXT), occurred_at, event_type
  FROM file_timeline;
DROP TABLE file_timeline;
ALTER TABLE file_timeline_new RENAME TO file_timeline;
CREATE INDEX idx_file_timeline_path ON file_timeline(file_path);
CREATE INDEX idx_file_timeline_changed ON file_timeline(changed_at);

-- ⑥ snapshots 再構築
CREATE TABLE snapshots_new (
  id TEXT PRIMARY KEY,
  snapshot_at TEXT NOT NULL,
  entity_count INTEGER,
  event_count INTEGER,
  metadata TEXT
);
INSERT INTO snapshots_new (id, snapshot_at, entity_count, event_count, metadata)
  SELECT CAST(id AS TEXT), snapshot_at, entity_count, event_count, metadata_json
  FROM snapshots;
DROP TABLE snapshots;
ALTER TABLE snapshots_new RENAME TO snapshots;
`;

const SPEC_ALIGNMENT_DOWN_SQL = `
-- provenance_links 削除
DROP TABLE IF EXISTS provenance_links;

-- VIEWの再作成（元の条件）
DROP VIEW IF EXISTS active_relations;
DROP VIEW IF EXISTS active_observations;
CREATE VIEW active_relations AS
  SELECT * FROM relations WHERE invalid_at IS NULL AND superseded_by IS NULL;
CREATE VIEW active_observations AS
  SELECT * FROM observations WHERE invalid_at IS NULL AND superseded_by IS NULL;
`;

export const migration007: Migration = {
  version: 9,
  name: "spec_alignment",
  up: (db) => {
    db.exec(SPEC_ALIGNMENT_SQL);
  },
  down: (db) => {
    db.exec(SPEC_ALIGNMENT_DOWN_SQL);
  },
};
