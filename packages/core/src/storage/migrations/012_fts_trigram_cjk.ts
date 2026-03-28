import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

/**
 * Migration 012: Add trigram FTS table for CJK (Japanese/Chinese/Korean) search
 *
 * unicode61 tokenizer breaks on CJK text because it relies on word boundaries
 * that don't exist in Japanese/Chinese. This adds a parallel trigram FTS table
 * that is used as a fallback when queries contain CJK characters.
 */
export const migration012: Migration = {
  version: 14,
  name: "012_fts_trigram_cjk",

  up(db: Database.Database) {
    db.exec(`
      -- CJK fallback FTS table using trigram tokenizer
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_notes_fts_trigram USING fts5(
        title,
        content,
        content='knowledge_notes',
        content_rowid='id',
        tokenize='trigram'
      );

      -- Triggers to keep trigram table in sync
      CREATE TRIGGER IF NOT EXISTS knowledge_notes_ai_trigram AFTER INSERT ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts_trigram(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_notes_ad_trigram AFTER DELETE ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts_trigram(knowledge_notes_fts_trigram, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_notes_au_trigram AFTER UPDATE ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts_trigram(knowledge_notes_fts_trigram, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
        INSERT INTO knowledge_notes_fts_trigram(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END;

      -- Rebuild trigram index with existing data
      INSERT INTO knowledge_notes_fts_trigram(knowledge_notes_fts_trigram) VALUES('rebuild');
    `);
  },

  down(db: Database.Database) {
    db.exec(`
      DROP TRIGGER IF EXISTS knowledge_notes_ai_trigram;
      DROP TRIGGER IF EXISTS knowledge_notes_ad_trigram;
      DROP TRIGGER IF EXISTS knowledge_notes_au_trigram;
      DROP TABLE IF EXISTS knowledge_notes_fts_trigram;
    `);
  },
};
