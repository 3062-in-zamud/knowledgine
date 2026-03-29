import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

/**
 * Migration 013: Add 'unknown' to entities CHECK constraint
 *
 * SQLite does not support ALTER COLUMN, so the entities table must be
 * recreated with the updated CHECK constraint. All data is preserved.
 *
 * Before: CHECK(entity_type IN ('person','project','technology','concept','tool','organization','event'))
 * After:  CHECK(entity_type IN ('person','project','technology','concept','tool','organization','event','unknown'))
 */
export const migration013: Migration = {
  version: 15,
  name: "013_unknown_entity_type",

  up(db: Database.Database) {
    db.exec(`
      -- Step 1: Create new entities table with updated CHECK constraint
      CREATE TABLE entities_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('person','project','technology','concept','tool','organization','event','unknown')),
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        metadata_json TEXT,
        UNIQUE(name, entity_type)
      );

      -- Step 2: Copy all data from old table
      INSERT INTO entities_new (id, name, entity_type, description, created_at, updated_at, metadata_json)
      SELECT id, name, entity_type, description, created_at, updated_at, metadata_json
      FROM entities;

      -- Step 3: Drop old FTS triggers that reference entities
      DROP TRIGGER IF EXISTS entities_ai;
      DROP TRIGGER IF EXISTS entities_ad;
      DROP TRIGGER IF EXISTS entities_au;

      -- Step 4: Drop old FTS table (content table reference will be stale)
      DROP TABLE IF EXISTS entities_fts;

      -- Step 5: Drop old entities table
      DROP TABLE entities;

      -- Step 6: Rename new table
      ALTER TABLE entities_new RENAME TO entities;

      -- Step 7: Recreate indexes
      CREATE INDEX idx_entities_name ON entities(name);
      CREATE INDEX idx_entities_type ON entities(entity_type);

      -- Step 8: Recreate FTS virtual table
      CREATE VIRTUAL TABLE entities_fts USING fts5(
        name, description,
        content='entities', content_rowid='id',
        tokenize='trigram'
      );

      -- Step 9: Recreate FTS triggers
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

      -- Step 10: Rebuild FTS index with existing data
      INSERT INTO entities_fts(entities_fts) VALUES('rebuild');
    `);
  },

  down(db: Database.Database) {
    db.exec(`
      -- Revert: recreate entities table without 'unknown' in CHECK constraint
      -- Note: rows with entity_type='unknown' will be deleted during down migration
      CREATE TABLE entities_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('person','project','technology','concept','tool','organization','event')),
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        metadata_json TEXT,
        UNIQUE(name, entity_type)
      );

      INSERT INTO entities_new (id, name, entity_type, description, created_at, updated_at, metadata_json)
      SELECT id, name, entity_type, description, created_at, updated_at, metadata_json
      FROM entities
      WHERE entity_type != 'unknown';

      DROP TRIGGER IF EXISTS entities_ai;
      DROP TRIGGER IF EXISTS entities_ad;
      DROP TRIGGER IF EXISTS entities_au;
      DROP TABLE IF EXISTS entities_fts;
      DROP TABLE entities;
      ALTER TABLE entities_new RENAME TO entities;

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

      INSERT INTO entities_fts(entities_fts) VALUES('rebuild');
    `);
  },
};
