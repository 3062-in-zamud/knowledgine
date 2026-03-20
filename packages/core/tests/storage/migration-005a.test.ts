import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("migration005a: events_layer", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("events table", () => {
    it("should create events table", () => {
      const result = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
        .get();
      expect(result).toBeDefined();
    });

    it("should have correct columns in events", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("event_type");
      expect(colNames).toContain("source_type");
      expect(colNames).toContain("source_id");
      expect(colNames).toContain("source_uri");
      expect(colNames).toContain("actor");
      expect(colNames).toContain("content");
      expect(colNames).toContain("content_hash");
      expect(colNames).toContain("occurred_at");
      expect(colNames).toContain("ingested_at");
      expect(colNames).toContain("metadata_json");
      expect(colNames).toContain("project_id");
      expect(colNames).toContain("session_id");
    });

    it("should insert an event", () => {
      const now = new Date().toISOString();
      const info = ctx.db
        .prepare(
          `INSERT INTO events (event_type, source_type, content, content_hash, occurred_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("git_commit", "git", "test content", "abc123", now);
      expect(info.lastInsertRowid).toBeGreaterThan(0);
    });

    it("should insert event with all optional fields", () => {
      const now = new Date().toISOString();
      const info = ctx.db
        .prepare(
          `INSERT INTO events (event_type, source_type, source_id, source_uri, actor, content, content_hash, occurred_at, metadata_json, project_id, session_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "pr_opened",
          "github",
          "pr-123",
          "https://github.com/org/repo/pull/123",
          "user@example.com",
          "PR content",
          "hash456",
          now,
          JSON.stringify({ labels: ["feature"] }),
          "proj-001",
          "sess-abc",
        );
      expect(info.lastInsertRowid).toBeGreaterThan(0);
    });

    it("should have indexes on events table", () => {
      const indexes = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='events'")
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_events_type");
      expect(indexNames).toContain("idx_events_source");
      expect(indexNames).toContain("idx_events_source_id");
      expect(indexNames).toContain("idx_events_occurred");
      expect(indexNames).toContain("idx_events_hash");
      expect(indexNames).toContain("idx_events_project");
    });
  });

  describe("ingest_cursors table", () => {
    it("should create ingest_cursors table", () => {
      const result = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ingest_cursors'")
        .get();
      expect(result).toBeDefined();
    });

    it("should have correct columns in ingest_cursors", () => {
      const cols = ctx.db
        .prepare("PRAGMA table_info(ingest_cursors)")
        .all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("plugin_id");
      expect(colNames).toContain("source_path");
      expect(colNames).toContain("checkpoint");
      expect(colNames).toContain("last_ingest_at");
      expect(colNames).toContain("metadata_json");
    });

    it("should insert an ingest cursor", () => {
      const now = new Date().toISOString();
      const info = ctx.db
        .prepare(
          `INSERT INTO ingest_cursors (plugin_id, source_path, checkpoint, last_ingest_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run("markdown-plugin", "/path/to/notes", "2024-01-01T00:00:00Z", now);
      expect(info.changes).toBe(1);
    });

    it("should enforce PK constraint on (plugin_id, source_path)", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          `INSERT INTO ingest_cursors (plugin_id, source_path, checkpoint, last_ingest_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run("plugin-a", "/path/a", "checkpoint-1", now);

      expect(() => {
        ctx.db
          .prepare(
            `INSERT INTO ingest_cursors (plugin_id, source_path, checkpoint, last_ingest_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run("plugin-a", "/path/a", "checkpoint-2", now);
      }).toThrow();
    });

    it("should allow same plugin_id with different source_path", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          `INSERT INTO ingest_cursors (plugin_id, source_path, checkpoint, last_ingest_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run("plugin-a", "/path/a", "checkpoint-1", now);
      const info = ctx.db
        .prepare(
          `INSERT INTO ingest_cursors (plugin_id, source_path, checkpoint, last_ingest_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run("plugin-a", "/path/b", "checkpoint-1", now);
      expect(info.changes).toBe(1);
    });
  });

  describe("knowledge_notes columns", () => {
    it("should have source_type column on knowledge_notes", () => {
      const cols = ctx.db
        .prepare("PRAGMA table_info(knowledge_notes)")
        .all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("source_type");
    });

    it("should have source_uri column on knowledge_notes", () => {
      const cols = ctx.db
        .prepare("PRAGMA table_info(knowledge_notes)")
        .all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("source_uri");
    });

    it("should have source_event_id column on knowledge_notes", () => {
      const cols = ctx.db
        .prepare("PRAGMA table_info(knowledge_notes)")
        .all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("source_event_id");
    });

    it("should allow inserting note with source fields", () => {
      const now = new Date().toISOString();
      const eventInfo = ctx.db
        .prepare(
          `INSERT INTO events (event_type, source_type, content, content_hash, occurred_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("document_change", "markdown", "doc content", "hashXYZ", now);
      const eventId = eventInfo.lastInsertRowid;

      const noteId = ctx.repository.saveNote({
        filePath: "sourced-note.md",
        title: "Sourced Note",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });

      ctx.db
        .prepare(
          `UPDATE knowledge_notes SET source_type=?, source_uri=?, source_event_id=? WHERE id=?`,
        )
        .run("markdown", "/path/to/sourced-note.md", eventId, noteId);

      const row = ctx.db
        .prepare("SELECT source_type, source_uri, source_event_id FROM knowledge_notes WHERE id=?")
        .get(noteId) as {
        source_type: string;
        source_uri: string;
        source_event_id: number;
      };
      expect(row.source_type).toBe("markdown");
      expect(row.source_uri).toBe("/path/to/sourced-note.md");
      expect(row.source_event_id).toBe(Number(eventId));
    });
  });

  describe("migration up/down cycle", () => {
    it("should apply migrations 1-5a sequentially via createTestDb", () => {
      // createTestDb already runs ALL_MIGRATIONS including 005a
      const eventsTable = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
        .get();
      expect(eventsTable).toBeDefined();

      const cursorsTable = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ingest_cursors'")
        .get();
      expect(cursorsTable).toBeDefined();
    });
  });

  describe("benchmark: 10000 events INSERT", () => {
    it("should insert 10000 events in under 5 seconds", () => {
      const insert = ctx.db.prepare(
        `INSERT INTO events (event_type, source_type, content, content_hash, occurred_at)
         VALUES (?, ?, ?, ?, ?)`,
      );

      const insertMany = ctx.db.transaction(() => {
        const now = new Date().toISOString();
        for (let i = 0; i < 10000; i++) {
          insert.run("git_commit", "git", `content-${i}`, `hash-${i}`, now);
        }
      });

      const start = Date.now();
      insertMany();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);

      const count = ctx.db.prepare("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
      expect(count.cnt).toBe(10000);
    });
  });
});
