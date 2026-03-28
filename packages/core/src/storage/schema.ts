export const SCHEMA_SQL = `
-- 1. knowledge_notes
CREATE TABLE IF NOT EXISTS knowledge_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  frontmatter_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  content_hash TEXT
);

-- 2. extracted_patterns
CREATE TABLE IF NOT EXISTS extracted_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL,
  pattern_type TEXT NOT NULL CHECK(pattern_type IN ('problem','solution','learning','time')),
  content TEXT NOT NULL,
  confidence REAL NOT NULL,
  context TEXT,
  line_number INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE
);

-- 3. problem_solution_pairs
CREATE TABLE IF NOT EXISTS problem_solution_pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_pattern_id INTEGER NOT NULL,
  solution_pattern_id INTEGER NOT NULL,
  relevance_score REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (problem_pattern_id) REFERENCES extracted_patterns(id) ON DELETE CASCADE,
  FOREIGN KEY (solution_pattern_id) REFERENCES extracted_patterns(id) ON DELETE CASCADE
);

-- 4. note_links
CREATE TABLE IF NOT EXISTS note_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_note_id INTEGER NOT NULL,
  target_note_id INTEGER NOT NULL,
  link_type TEXT NOT NULL,
  similarity REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE,
  UNIQUE(source_note_id, target_note_id)
);

-- 5. FTS5 virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_notes_fts USING fts5(
  title,
  content,
  content='knowledge_notes',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- FTS5 triggers
CREATE TRIGGER IF NOT EXISTS knowledge_notes_ai AFTER INSERT ON knowledge_notes BEGIN
  INSERT INTO knowledge_notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_notes_ad AFTER DELETE ON knowledge_notes BEGIN
  INSERT INTO knowledge_notes_fts(knowledge_notes_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_notes_au AFTER UPDATE ON knowledge_notes BEGIN
  INSERT INTO knowledge_notes_fts(knowledge_notes_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
  INSERT INTO knowledge_notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_created_at ON knowledge_notes(created_at);
CREATE INDEX IF NOT EXISTS idx_extracted_patterns_note_id ON extracted_patterns(note_id);
CREATE INDEX IF NOT EXISTS idx_extracted_patterns_type ON extracted_patterns(pattern_type);
`;
