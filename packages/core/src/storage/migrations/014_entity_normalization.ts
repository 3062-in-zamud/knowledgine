import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";
import { normalizeEntityName } from "../../graph/entity-utils.js";

export const migration014: Migration = {
  version: 16,
  name: "014_entity_normalization",

  up(db: Database.Database) {
    // Step 1: Create new entities table with normalized_name column
    db.exec(`
      CREATE TABLE entities_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('person','project','technology','concept','tool','organization','event','unknown')),
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        metadata_json TEXT,
        UNIQUE(normalized_name, entity_type)
      );
    `);

    // Step 2: Normalize names via JS and INSERT (skip duplicates)
    const rows = db.prepare("SELECT * FROM entities ORDER BY created_at ASC").all() as Array<{
      id: number;
      name: string;
      entity_type: string;
      description: string | null;
      created_at: string;
      updated_at: string | null;
      metadata_json: string | null;
    }>;
    const insert = db.prepare(
      `INSERT OR IGNORE INTO entities_new (id, name, normalized_name, entity_type, description, created_at, updated_at, metadata_json)
       VALUES (@id, @name, @normalized_name, @entity_type, @description, @created_at, @updated_at, @metadata_json)`,
    );
    const idMapping = new Map<number, number>(); // old id -> surviving id

    for (const row of rows) {
      const normalizedName = normalizeEntityName(row.name);
      const info = insert.run({ ...row, normalized_name: normalizedName });
      if (info.changes > 0) {
        idMapping.set(row.id, row.id);
      } else {
        // UNIQUE constraint violation = same normalized_name+type already exists
        const existing = db
          .prepare("SELECT id FROM entities_new WHERE normalized_name = ? AND entity_type = ?")
          .get(normalizedName, row.entity_type) as { id: number } | undefined;
        if (existing) idMapping.set(row.id, existing.id);
      }
    }

    // Step 3: Remap FK references — update first, then delete orphaned rows
    for (const [oldId, newId] of idMapping) {
      if (oldId !== newId) {
        db.prepare(
          "UPDATE OR IGNORE relations SET from_entity_id = ? WHERE from_entity_id = ?",
        ).run(newId, oldId);
        db.prepare("UPDATE OR IGNORE relations SET to_entity_id = ? WHERE to_entity_id = ?").run(
          newId,
          oldId,
        );
        db.prepare("UPDATE OR IGNORE observations SET entity_id = ? WHERE entity_id = ?").run(
          newId,
          oldId,
        );
        db.prepare("UPDATE OR IGNORE entity_note_links SET entity_id = ? WHERE entity_id = ?").run(
          newId,
          oldId,
        );
        // Delete any rows that UPDATE OR IGNORE skipped (would violate UNIQUE)
        db.prepare("DELETE FROM relations WHERE from_entity_id = ? OR to_entity_id = ?").run(
          oldId,
          oldId,
        );
        db.prepare("DELETE FROM observations WHERE entity_id = ?").run(oldId);
        db.prepare("DELETE FROM entity_note_links WHERE entity_id = ?").run(oldId);
      }
    }

    // Step 4: Disable FK enforcement during table swap to prevent CASCADE deletes
    db.pragma("foreign_keys = OFF");
    db.exec(`
      DROP TRIGGER IF EXISTS entities_ai;
      DROP TRIGGER IF EXISTS entities_ad;
      DROP TRIGGER IF EXISTS entities_au;
      DROP TABLE IF EXISTS entities_fts;
      DROP TABLE entities;
      ALTER TABLE entities_new RENAME TO entities;

      CREATE INDEX idx_entities_name ON entities(name);
      CREATE INDEX idx_entities_normalized ON entities(normalized_name);
      CREATE INDEX idx_entities_type ON entities(entity_type);

      CREATE VIRTUAL TABLE entities_fts USING fts5(
        name, description, content='entities', content_rowid='id', tokenize='trigram'
      );

      CREATE TRIGGER entities_ai AFTER INSERT ON entities BEGIN
        INSERT INTO entities_fts(rowid, name, description) VALUES (new.id, new.name, COALESCE(new.description, ''));
      END;
      CREATE TRIGGER entities_ad AFTER DELETE ON entities BEGIN
        INSERT INTO entities_fts(entities_fts, rowid, name, description) VALUES ('delete', old.id, old.name, COALESCE(old.description, ''));
      END;
      CREATE TRIGGER entities_au AFTER UPDATE ON entities BEGIN
        INSERT INTO entities_fts(entities_fts, rowid, name, description) VALUES ('delete', old.id, old.name, COALESCE(old.description, ''));
        INSERT INTO entities_fts(rowid, name, description) VALUES (new.id, new.name, COALESCE(new.description, ''));
      END;

      INSERT INTO entities_fts(entities_fts) VALUES('rebuild');
    `);
    db.pragma("foreign_keys = ON");
  },

  down(db: Database.Database) {
    // Revert: remove normalized_name column (data merging is irreversible)
    db.pragma("foreign_keys = OFF");
    db.exec(`
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
      INSERT OR IGNORE INTO entities_new (id, name, entity_type, description, created_at, updated_at, metadata_json)
        SELECT id, name, entity_type, description, created_at, updated_at, metadata_json FROM entities;

      DROP TRIGGER IF EXISTS entities_ai;
      DROP TRIGGER IF EXISTS entities_ad;
      DROP TRIGGER IF EXISTS entities_au;
      DROP TABLE IF EXISTS entities_fts;
      DROP TABLE entities;
      ALTER TABLE entities_new RENAME TO entities;

      CREATE INDEX idx_entities_name ON entities(name);
      CREATE INDEX idx_entities_type ON entities(entity_type);

      CREATE VIRTUAL TABLE entities_fts USING fts5(name, description, content='entities', content_rowid='id', tokenize='trigram');
      CREATE TRIGGER entities_ai AFTER INSERT ON entities BEGIN INSERT INTO entities_fts(rowid, name, description) VALUES (new.id, new.name, COALESCE(new.description, '')); END;
      CREATE TRIGGER entities_ad AFTER DELETE ON entities BEGIN INSERT INTO entities_fts(entities_fts, rowid, name, description) VALUES ('delete', old.id, old.name, COALESCE(old.description, '')); END;
      CREATE TRIGGER entities_au AFTER UPDATE ON entities BEGIN INSERT INTO entities_fts(entities_fts, rowid, name, description) VALUES ('delete', old.id, old.name, COALESCE(old.description, '')); INSERT INTO entities_fts(rowid, name, description) VALUES (new.id, new.name, COALESCE(new.description, '')); END;
      INSERT INTO entities_fts(entities_fts) VALUES('rebuild');
    `);
    db.pragma("foreign_keys = ON");
  },
};
