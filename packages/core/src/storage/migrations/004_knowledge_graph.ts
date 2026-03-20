import type { Migration } from "../migrator.js";

const KNOWLEDGE_GRAPH_SQL = `
CREATE TABLE entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('person','project','technology','concept','tool','organization','event')),
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  metadata_json TEXT,
  UNIQUE(name, entity_type)
);

CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_type ON entities(entity_type);

CREATE VIRTUAL TABLE entities_fts USING fts5(
  name, description,
  content='entities', content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, name, description)
  VALUES (new.id, new.name, COALESCE(new.description, ''));
END;

CREATE TRIGGER entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, description)
  VALUES ('delete', old.id, old.name, COALESCE(old.description, ''));
END;

CREATE TRIGGER entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, description)
  VALUES ('delete', old.id, old.name, COALESCE(old.description, ''));
  INSERT INTO entities_fts(rowid, name, description)
  VALUES (new.id, new.name, COALESCE(new.description, ''));
END;

CREATE TABLE relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_entity_id INTEGER NOT NULL,
  to_entity_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL CHECK(relation_type IN (
    'uses','implements','depends_on','related_to','created_by',
    'works_on','solves','references','part_of','similar_to'
  )),
  strength REAL NOT NULL DEFAULT 1.0,
  description TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  UNIQUE(from_entity_id, to_entity_id, relation_type)
);

CREATE INDEX idx_relations_from ON relations(from_entity_id);
CREATE INDEX idx_relations_to ON relations(to_entity_id);
CREATE INDEX idx_relations_type ON relations(relation_type);

CREATE TABLE observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  observation_type TEXT NOT NULL CHECK(observation_type IN ('fact','insight','learning','decision','performance')),
  confidence REAL,
  source_note_id INTEGER,
  source_pattern_id INTEGER,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (source_note_id) REFERENCES knowledge_notes(id) ON DELETE SET NULL,
  FOREIGN KEY (source_pattern_id) REFERENCES extracted_patterns(id) ON DELETE SET NULL
);

CREATE INDEX idx_observations_entity ON observations(entity_id);
CREATE INDEX idx_observations_type ON observations(observation_type);

CREATE TABLE entity_note_links (
  entity_id INTEGER NOT NULL,
  note_id INTEGER NOT NULL,
  PRIMARY KEY (entity_id, note_id),
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE
);

CREATE INDEX idx_entity_note_links_note ON entity_note_links(note_id);
`;

export const migration004: Migration = {
  version: 4,
  name: "knowledge_graph",
  up: (db) => {
    db.exec(KNOWLEDGE_GRAPH_SQL);
  },
  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS entity_note_links;
      DROP TABLE IF EXISTS observations;
      DROP TABLE IF EXISTS relations;
      DROP TRIGGER IF EXISTS entities_au;
      DROP TRIGGER IF EXISTS entities_ad;
      DROP TRIGGER IF EXISTS entities_ai;
      DROP TABLE IF EXISTS entities_fts;
      DROP TABLE IF EXISTS entities;
    `);
  },
};
