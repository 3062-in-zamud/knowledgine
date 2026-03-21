import type { Migration } from "../migrator.js";

const PROVENANCE_SQL = `
CREATE TABLE provenance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_uri    TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('ingest', 'extract', 'link', 'embed')),
  agent         TEXT NOT NULL,
  input_uris    TEXT NOT NULL DEFAULT '[]',
  output_uris   TEXT NOT NULL DEFAULT '[]',
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  metadata_json TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_provenance_entity ON provenance(entity_uri);
CREATE INDEX idx_provenance_activity ON provenance(activity_type);
CREATE INDEX idx_provenance_agent ON provenance(agent);

CREATE TABLE file_timeline (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path   TEXT NOT NULL,
  event_type  TEXT NOT NULL CHECK(event_type IN ('created', 'modified', 'deleted', 'renamed')),
  event_id    INTEGER REFERENCES events(id),
  occurred_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX idx_file_timeline_path ON file_timeline(file_path);
CREATE INDEX idx_file_timeline_occurred ON file_timeline(occurred_at);

CREATE TABLE snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_at TEXT NOT NULL,
  note_count  INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  entity_count INTEGER NOT NULL,
  metadata_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const PROVENANCE_DOWN_SQL = `
DROP TABLE IF EXISTS snapshots;
DROP TABLE IF EXISTS file_timeline;
DROP TABLE IF EXISTS provenance;
`;

export const migration005c: Migration = {
  version: 8,
  name: "provenance",
  up: (db) => {
    db.exec(PROVENANCE_SQL);
  },
  down: (db) => {
    db.exec(PROVENANCE_DOWN_SQL);
  },
};
