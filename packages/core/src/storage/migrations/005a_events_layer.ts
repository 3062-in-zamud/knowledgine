import type { Migration } from "../migrator.js";

const EVENTS_LAYER_SQL = `
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_uri TEXT,
  actor TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT,
  project_id TEXT,
  session_id TEXT
);

CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_source ON events(source_type);
CREATE INDEX idx_events_source_id ON events(source_id);
CREATE INDEX idx_events_occurred ON events(occurred_at);
CREATE INDEX idx_events_hash ON events(content_hash);
CREATE INDEX idx_events_project ON events(project_id);

CREATE TABLE ingest_cursors (
  plugin_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  checkpoint TEXT NOT NULL,
  last_ingest_at TEXT NOT NULL,
  metadata_json TEXT,
  PRIMARY KEY (plugin_id, source_path)
);

ALTER TABLE knowledge_notes ADD COLUMN source_type TEXT;
ALTER TABLE knowledge_notes ADD COLUMN source_uri TEXT;
ALTER TABLE knowledge_notes ADD COLUMN source_event_id INTEGER REFERENCES events(id);
`;

export const migration005a: Migration = {
  version: 5,
  name: "events_layer",
  up: (db) => {
    db.exec(EVENTS_LAYER_SQL);
  },
  down: (db) => {
    // knowledge_notes のカラム削除はSQLiteでは不可のため、
    // テーブル再作成が必要。ここでは新テーブルのみ削除。
    db.exec(`
      DROP TABLE IF EXISTS ingest_cursors;
      DROP TABLE IF EXISTS events;
    `);
    // Note: SQLiteはALTER TABLE DROP COLUMNをサポートしない (3.35.0以降は可)
    // knowledge_notes.source_type, source_uri, source_event_id は残る
  },
};
