import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

/**
 * Migration 011: FTS5 unicode61 tokenizer
 *
 * Replaces the trigram tokenizer with unicode61 for proper BM25 ranking.
 * trigram はサブストリング検索には有利だが BM25 の統計モデルを破壊する。
 * unicode61 はワード単位のトークン化を行い、BM25 が正しく機能する。
 */
export const migration011: Migration = {
  version: 13,
  name: "011_fts_unicode61_tokenizer",

  up(db: Database.Database) {
    db.exec(`
      -- Drop existing FTS triggers
      DROP TRIGGER IF EXISTS knowledge_notes_ai;
      DROP TRIGGER IF EXISTS knowledge_notes_ad;
      DROP TRIGGER IF EXISTS knowledge_notes_au;

      -- Drop existing FTS table
      DROP TABLE IF EXISTS knowledge_notes_fts;

      -- Recreate with unicode61 tokenizer for proper BM25 ranking
      CREATE VIRTUAL TABLE knowledge_notes_fts USING fts5(
        title,
        content,
        content='knowledge_notes',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
      );

      -- Recreate triggers
      CREATE TRIGGER knowledge_notes_ai AFTER INSERT ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END;

      CREATE TRIGGER knowledge_notes_ad AFTER DELETE ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts(knowledge_notes_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
      END;

      CREATE TRIGGER knowledge_notes_au AFTER UPDATE ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts(knowledge_notes_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
        INSERT INTO knowledge_notes_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END;

      -- Rebuild index with existing data
      INSERT INTO knowledge_notes_fts(knowledge_notes_fts) VALUES('rebuild');
    `);
  },

  down(db: Database.Database) {
    db.exec(`
      DROP TRIGGER IF EXISTS knowledge_notes_ai;
      DROP TRIGGER IF EXISTS knowledge_notes_ad;
      DROP TRIGGER IF EXISTS knowledge_notes_au;
      DROP TABLE IF EXISTS knowledge_notes_fts;

      CREATE VIRTUAL TABLE knowledge_notes_fts USING fts5(
        title,
        content,
        content='knowledge_notes',
        content_rowid='id',
        tokenize='trigram'
      );

      CREATE TRIGGER knowledge_notes_ai AFTER INSERT ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END;

      CREATE TRIGGER knowledge_notes_ad AFTER DELETE ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts(knowledge_notes_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
      END;

      CREATE TRIGGER knowledge_notes_au AFTER UPDATE ON knowledge_notes BEGIN
        INSERT INTO knowledge_notes_fts(knowledge_notes_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
        INSERT INTO knowledge_notes_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END;

      INSERT INTO knowledge_notes_fts(knowledge_notes_fts) VALUES('rebuild');
    `);
  },
};
