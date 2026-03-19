import type { Migration } from "../migrator.js";
import { SCHEMA_SQL } from "../schema.js";

export const migration001: Migration = {
  version: 1,
  name: "initial_schema",
  up: (db) => {
    db.exec(SCHEMA_SQL);
  },
  down: (db) => {
    db.exec(`
      DROP TRIGGER IF EXISTS knowledge_notes_au;
      DROP TRIGGER IF EXISTS knowledge_notes_ad;
      DROP TRIGGER IF EXISTS knowledge_notes_ai;
      DROP TABLE IF EXISTS knowledge_notes_fts;
      DROP TABLE IF EXISTS note_links;
      DROP TABLE IF EXISTS problem_solution_pairs;
      DROP TABLE IF EXISTS extracted_patterns;
      DROP TABLE IF EXISTS knowledge_notes;
    `);
  },
};
