// vec0 transaction-rollback spike (KNOW-338 Phase 4a / Decision 5).
//
// Verifies whether INT8 mirror writes to `note_embeddings_vec` survive a
// ROLLBACK on the same connection. The result decides whether
// NoteTransferService must wrap the copy entirely in a single transaction
// (mirror is transactional) or treat the mirror as a post-commit
// reconstruction step (mirror is non-transactional).
//
// We use a fully-migrated DB (so `note_embeddings_vec` is INT8[384]) and
// raw `BEGIN; ... ROLLBACK;` so we are not relying on better-sqlite3's
// `db.transaction(fn)` wrapper.

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  loadSqliteVecExtension,
} from "../../src/index.js";

function buildFloat32Embedding(seed: number): Float32Array {
  const f32 = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    // Deterministic but non-trivial values; not normalized — that is fine
    // for this spike since we only care about row counts.
    f32[i] = Math.sin((seed * 0.001 + i) * 0.1) * 0.05;
  }
  return f32;
}

const SPIKE_MODEL = "all-MiniLM-L6-v2";

describe("vec0 transaction rollback spike", () => {
  it("notes whether note_embeddings_vec writes survive ROLLBACK", async () => {
    const dir = mkdtempSync(join(tmpdir(), "knowledgine-vec0-spike-"));
    try {
      const dbPath = join(dir, ".knowledgine", "index.sqlite");
      const db = createDatabase(dbPath);
      const vecLoaded = await loadSqliteVecExtension(db);
      // The spike is only meaningful when the extension is loaded; skip
      // gracefully if not (some CI matrices ship without it).
      if (!vecLoaded) {
        expect(vecLoaded).toBe(false); // record the skip explicitly
        db.close();
        return;
      }
      new Migrator(db, ALL_MIGRATIONS).migrate();

      const repo = new KnowledgeRepository(db);

      // Pre-load 100 notes with embeddings so we have a baseline.
      const baseline = 100;
      for (let i = 0; i < baseline; i++) {
        const noteId = repo.saveNote({
          filePath: `note-${i}.md`,
          title: `Note ${i}`,
          content: `body ${i}`,
          createdAt: new Date().toISOString(),
        });
        repo.saveEmbedding(noteId, buildFloat32Embedding(i), SPIKE_MODEL);
      }

      const countVec = (): number => {
        const row = db.prepare("SELECT COUNT(*) AS c FROM note_embeddings_vec").get() as
          | { c: number }
          | undefined;
        return row?.c ?? 0;
      };
      const countNotes = (): number => {
        const row = db.prepare("SELECT COUNT(*) AS c FROM knowledge_notes").get() as
          | { c: number }
          | undefined;
        return row?.c ?? 0;
      };

      const baselineVec = countVec();
      const baselineNotes = countNotes();
      expect(baselineVec).toBe(baseline);
      expect(baselineNotes).toBe(baseline);

      // Now begin a transaction, insert 50 more, then rollback.
      db.exec("BEGIN");
      try {
        for (let i = baseline; i < baseline + 50; i++) {
          const noteId = repo.saveNote({
            filePath: `note-${i}.md`,
            title: `Note ${i}`,
            content: `body ${i}`,
            createdAt: new Date().toISOString(),
          });
          repo.saveEmbedding(noteId, buildFloat32Embedding(i), SPIKE_MODEL);
        }
        // mid-transaction sanity: the new rows should be visible to us.
        expect(countNotes()).toBe(baseline + 50);
        expect(countVec()).toBe(baseline + 50);
      } finally {
        db.exec("ROLLBACK");
      }

      const afterNotes = countNotes();
      const afterVec = countVec();
      // Standard SQLite: ROLLBACK reverts knowledge_notes to baseline.
      expect(afterNotes).toBe(baseline);
      // The interesting question for KNOW-338: does vec0 also revert?
      // `expect(afterVec).toBe(baseline)` would be the strict assertion.
      // We log either way and assert the OBSERVED behavior so future runs
      // surface a regression if vec0's transactional semantics change.
      const vecHonorsRollback = afterVec === baseline;
      process.stderr.write(
        `[vec0-spike] ROLLBACK: notes=${afterNotes}/${baseline}, vec=${afterVec}/${baseline}, ` +
          `vec0HonorsRollback=${vecHonorsRollback}\n`,
      );
      // Pin the current behavior. If this assertion ever flips, update
      // design.md §"Decision 5" and adjust NoteTransferService accordingly.
      expect(vecHonorsRollback).toBe(true);

      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
