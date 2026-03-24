import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

/**
 * Migration 008: Knowledge Versioning
 *
 * Adds versioning and deprecation support to knowledge tables:
 * - knowledge_notes: version tracking, supersedes (FK), valid_from, deprecated flag
 * - extracted_patterns: deprecated flag
 * - problem_solution_pairs: version tracking, supersedes, deprecated flag
 *
 * Naming note:
 * - knowledge_notes uses `valid_from` (start point) vs graph's `valid_at` (point in time)
 * - knowledge_notes uses `supersedes` (INTEGER FK) vs graph's `superseded_by` (TEXT, legacy)
 */
export const migration008: Migration = {
  version: 10,
  name: "knowledge_versioning",

  up: (db: Database.Database) => {
    // ① knowledge_notes: versioning and deprecation columns
    db.exec(`
      ALTER TABLE knowledge_notes ADD COLUMN version INTEGER DEFAULT 1;
      ALTER TABLE knowledge_notes ADD COLUMN supersedes INTEGER REFERENCES knowledge_notes(id) ON DELETE SET NULL;
      ALTER TABLE knowledge_notes ADD COLUMN valid_from TEXT;
      ALTER TABLE knowledge_notes ADD COLUMN deprecated INTEGER DEFAULT 0 CHECK(deprecated IN (0, 1));
      ALTER TABLE knowledge_notes ADD COLUMN deprecation_reason TEXT;
    `);

    // ② extracted_patterns: deprecation columns
    db.exec(`
      ALTER TABLE extracted_patterns ADD COLUMN deprecated INTEGER DEFAULT 0 CHECK(deprecated IN (0, 1));
      ALTER TABLE extracted_patterns ADD COLUMN deprecation_reason TEXT;
    `);

    // ③ problem_solution_pairs: versioning and deprecation columns
    // NOTE: supersedes is TEXT here — PSPs benefit from free-form references (not self-FK)
    db.exec(`
      ALTER TABLE problem_solution_pairs ADD COLUMN version INTEGER DEFAULT 1;
      ALTER TABLE problem_solution_pairs ADD COLUMN supersedes TEXT;
      ALTER TABLE problem_solution_pairs ADD COLUMN deprecated INTEGER DEFAULT 0 CHECK(deprecated IN (0, 1));
      ALTER TABLE problem_solution_pairs ADD COLUMN deprecation_reason TEXT;
    `);

    // ④ Backfill valid_from with created_at for existing data (same pattern as 005b_bitemporal)
    db.exec(`
      UPDATE knowledge_notes SET valid_from = created_at WHERE valid_from IS NULL;
    `);

    // ⑤ Indexes for common query patterns
    db.exec(`
      CREATE INDEX idx_knowledge_notes_deprecated ON knowledge_notes(deprecated);
      CREATE INDEX idx_knowledge_notes_valid_from ON knowledge_notes(valid_from);
      CREATE INDEX idx_ps_pairs_deprecated ON problem_solution_pairs(deprecated);
    `);

    // ⑥ Views (same pattern as active_relations / active_observations)
    db.exec(`
      CREATE VIEW active_knowledge_notes AS
        SELECT * FROM knowledge_notes WHERE deprecated = 0;

      CREATE VIEW active_problem_solution_pairs AS
        SELECT * FROM problem_solution_pairs WHERE deprecated = 0;
    `);
  },

  down: (db: Database.Database) => {
    // Drop views and indexes only. Columns are kept (same pattern as 005a_events_layer)
    // to avoid FTS5 trigger and FK constraint complications with table recreation.
    db.exec(`
      DROP VIEW IF EXISTS active_knowledge_notes;
      DROP VIEW IF EXISTS active_problem_solution_pairs;
      DROP INDEX IF EXISTS idx_knowledge_notes_deprecated;
      DROP INDEX IF EXISTS idx_knowledge_notes_valid_from;
      DROP INDEX IF EXISTS idx_ps_pairs_deprecated;
    `);
  },
};
