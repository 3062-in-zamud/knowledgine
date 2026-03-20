import type { Migration } from "../migrator.js";

const EXTRACTION_FEEDBACK_SQL = `
CREATE TABLE IF NOT EXISTS extraction_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_name TEXT NOT NULL,
  entity_type TEXT,
  error_type TEXT NOT NULL CHECK(error_type IN ('false_positive', 'wrong_type', 'missed_entity')),
  correct_type TEXT,
  note_id INTEGER,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'applied', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at TEXT,
  FOREIGN KEY (note_id) REFERENCES knowledge_notes(id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON extraction_feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_entity ON extraction_feedback(entity_name);
`;

export const migration006: Migration = {
  version: 6,
  name: "extraction_feedback",
  up: (db) => {
    db.exec(EXTRACTION_FEEDBACK_SQL);
  },
  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS extraction_feedback;
    `);
  },
};
