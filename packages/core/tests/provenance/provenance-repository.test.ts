import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProvenanceRepository } from "../../src/provenance/provenance-repository.js";
import { createTestDb } from "../helpers/test-db.js";
import { Migrator } from "../../src/storage/migrator.js";
import { createDatabase } from "../../src/storage/database.js";
import { ALL_MIGRATIONS } from "../../src/index.js";
import { migration001 } from "../../src/storage/migrations/001_initial.js";
import { migration002 } from "../../src/storage/migrations/002_memory_layers.js";
import { migration003 } from "../../src/storage/migrations/003_vector_embeddings.js";
import { migration004 } from "../../src/storage/migrations/004_knowledge_graph.js";
import { migration005a } from "../../src/storage/migrations/005a_events_layer.js";
import { migration006 } from "../../src/storage/migrations/006_extraction_feedback.js";
import type { TestContext } from "../helpers/test-db.js";

describe("migration005c: provenance", () => {
  describe("schema creation", () => {
    it("should create provenance table", () => {
      const db = createDatabase(":memory:");
      new Migrator(db, ALL_MIGRATIONS).migrate();
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='provenance'")
        .get();
      expect(result).toBeDefined();
      db.close();
    });

    it("should create file_timeline table", () => {
      const db = createDatabase(":memory:");
      new Migrator(db, ALL_MIGRATIONS).migrate();
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='file_timeline'")
        .get();
      expect(result).toBeDefined();
      db.close();
    });

    it("should create snapshots table", () => {
      const db = createDatabase(":memory:");
      new Migrator(db, ALL_MIGRATIONS).migrate();
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='snapshots'")
        .get();
      expect(result).toBeDefined();
      db.close();
    });

    it("should not break existing tables", () => {
      const db = createDatabase(":memory:");
      new Migrator(db, ALL_MIGRATIONS).migrate();

      // 既存テーブルが存在することを確認
      const existingTables = ["knowledge_notes", "entities", "relations", "observations", "events"];
      for (const tableName of existingTables) {
        const result = db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
          .get(tableName);
        expect(result).toBeDefined();
      }
      db.close();
    });

    it("should enforce CHECK constraint on activity_type", () => {
      const db = createDatabase(":memory:");
      new Migrator(db, ALL_MIGRATIONS).migrate();
      expect(() => {
        db.prepare(
          `INSERT INTO provenance (entity_uri, activity_type, agent, started_at) VALUES (?, ?, ?, ?)`,
        ).run("file://test", "invalid_type", "test-agent", new Date().toISOString());
      }).toThrow();
      db.close();
    });

    it("should enforce CHECK constraint on file_timeline event_type", () => {
      const db = createDatabase(":memory:");
      new Migrator(db, ALL_MIGRATIONS).migrate();
      expect(() => {
        db.prepare(
          `INSERT INTO file_timeline (file_path, event_type, occurred_at) VALUES (?, ?, ?)`,
        ).run("/test/file.md", "invalid_event", new Date().toISOString());
      }).toThrow();
      db.close();
    });
  });

  describe("Migration path: Wave 2 → Wave 3", () => {
    it("should auto-apply 005b and 005c on existing Wave 2 DB", () => {
      const db = createDatabase(":memory:");
      const wave2Migrations = [
        migration001,
        migration002,
        migration003,
        migration004,
        migration005a,
        migration006,
      ];
      new Migrator(db, wave2Migrations).migrate();
      expect(new Migrator(db, wave2Migrations).getCurrentVersion()).toBe(6);

      new Migrator(db, ALL_MIGRATIONS).migrate();
      expect(new Migrator(db, ALL_MIGRATIONS).getCurrentVersion()).toBe(8);

      // VIEWとテーブルの存在確認
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
        )
        .all();
      const names = (tables as Array<{ name: string }>).map((t) => t.name);
      expect(names).toContain("active_relations");
      expect(names).toContain("active_observations");
      expect(names).toContain("provenance");
      expect(names).toContain("file_timeline");
      expect(names).toContain("snapshots");
      db.close();
    });
  });
});

describe("ProvenanceRepository", () => {
  let ctx: TestContext;
  let repo: ProvenanceRepository;

  beforeEach(() => {
    ctx = createTestDb();
    repo = new ProvenanceRepository(ctx.db);
  });

  afterEach(() => {
    ctx.db.close();
  });

  // ── 来歴記録 ──────────────────────────────────────────────────────

  describe("record / getByEntityUri", () => {
    it("should record and retrieve by entityUri", () => {
      const now = new Date().toISOString();
      const id = repo.record({
        entityUri: "file://test.md",
        activityType: "ingest",
        agent: "test-agent",
        inputUris: ["file://source.md"],
        outputUris: ["file://output.md"],
        startedAt: now,
      });
      expect(id).toBeGreaterThan(0);

      const records = repo.getByEntityUri("file://test.md");
      expect(records.length).toBe(1);
      expect(records[0].entityUri).toBe("file://test.md");
      expect(records[0].activityType).toBe("ingest");
      expect(records[0].agent).toBe("test-agent");
    });

    it("should serialize and deserialize inputUris/outputUris as JSON arrays", () => {
      const now = new Date().toISOString();
      repo.record({
        entityUri: "file://array-test.md",
        activityType: "extract",
        agent: "extractor",
        inputUris: ["file://a.md", "file://b.md"],
        outputUris: ["entity://concept-1", "entity://concept-2"],
        startedAt: now,
      });

      const records = repo.getByEntityUri("file://array-test.md");
      expect(records[0].inputUris).toEqual(["file://a.md", "file://b.md"]);
      expect(records[0].outputUris).toEqual(["entity://concept-1", "entity://concept-2"]);
    });

    it("should store empty arrays as []", () => {
      const now = new Date().toISOString();
      repo.record({
        entityUri: "file://empty-arrays.md",
        activityType: "link",
        agent: "linker",
        inputUris: [],
        outputUris: [],
        startedAt: now,
      });

      const records = repo.getByEntityUri("file://empty-arrays.md");
      expect(records[0].inputUris).toEqual([]);
      expect(records[0].outputUris).toEqual([]);
    });

    it("should return empty array for unknown entityUri", () => {
      const records = repo.getByEntityUri("file://nonexistent.md");
      expect(records).toEqual([]);
    });

    it("should serialize and deserialize metadata", () => {
      const now = new Date().toISOString();
      repo.record({
        entityUri: "file://meta-test.md",
        activityType: "embed",
        agent: "embedder",
        inputUris: [],
        outputUris: [],
        startedAt: now,
        metadata: { model: "all-MiniLM", dimensions: 384 },
      });

      const records = repo.getByEntityUri("file://meta-test.md");
      expect(records[0].metadata).toEqual({ model: "all-MiniLM", dimensions: 384 });
    });
  });

  describe("getByAgent", () => {
    it("should retrieve records by agent", () => {
      const now = new Date().toISOString();
      repo.record({ entityUri: "file://a.md", activityType: "ingest", agent: "agent-x", inputUris: [], outputUris: [], startedAt: now });
      repo.record({ entityUri: "file://b.md", activityType: "ingest", agent: "agent-y", inputUris: [], outputUris: [], startedAt: now });
      repo.record({ entityUri: "file://c.md", activityType: "ingest", agent: "agent-x", inputUris: [], outputUris: [], startedAt: now });

      const records = repo.getByAgent("agent-x");
      expect(records.length).toBe(2);
      expect(records.every((r) => r.agent === "agent-x")).toBe(true);
    });

    it("should respect limit", () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        repo.record({ entityUri: `file://limit-${i}.md`, activityType: "ingest", agent: "limit-agent", inputUris: [], outputUris: [], startedAt: now });
      }
      const records = repo.getByAgent("limit-agent", 3);
      expect(records.length).toBeLessThanOrEqual(3);
    });

    it("should return empty array for unknown agent", () => {
      expect(repo.getByAgent("nonexistent-agent")).toEqual([]);
    });
  });

  describe("getByActivity", () => {
    it("should retrieve records by activity type", () => {
      const now = new Date().toISOString();
      repo.record({ entityUri: "file://extract-1.md", activityType: "extract", agent: "ex-agent", inputUris: [], outputUris: [], startedAt: now });
      repo.record({ entityUri: "file://ingest-1.md", activityType: "ingest", agent: "in-agent", inputUris: [], outputUris: [], startedAt: now });

      const records = repo.getByActivity("extract");
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records.every((r) => r.activityType === "extract")).toBe(true);
    });

    it("should respect limit", () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        repo.record({ entityUri: `file://act-${i}.md`, activityType: "embed", agent: "embedder", inputUris: [], outputUris: [], startedAt: now });
      }
      const records = repo.getByActivity("embed", 2);
      expect(records.length).toBeLessThanOrEqual(2);
    });
  });

  // ── ファイルタイムライン ─────────────────────────────────────────

  describe("recordFileEvent / getFileTimeline", () => {
    it("should record and retrieve file events in chronological order", () => {
      const path = "/notes/test.md";
      repo.recordFileEvent(path, "created", undefined, "2024-01-01T00:00:00");
      repo.recordFileEvent(path, "modified", undefined, "2024-06-01T00:00:00");
      repo.recordFileEvent(path, "modified", undefined, "2024-12-01T00:00:00");

      const timeline = repo.getFileTimeline(path);
      expect(timeline.length).toBe(3);
      expect(timeline[0].eventType).toBe("created");
      expect(timeline[1].eventType).toBe("modified");
      expect(timeline[2].eventType).toBe("modified");
      // 時系列順（ASC）
      expect(timeline[0].occurredAt < timeline[1].occurredAt).toBe(true);
    });

    it("should accumulate multiple events for same file", () => {
      const path = "/notes/multi.md";
      repo.recordFileEvent(path, "created");
      repo.recordFileEvent(path, "modified");
      repo.recordFileEvent(path, "deleted");

      const timeline = repo.getFileTimeline(path);
      expect(timeline.length).toBe(3);
    });

    it("should return empty array for unknown file", () => {
      const timeline = repo.getFileTimeline("/nonexistent/file.md");
      expect(timeline).toEqual([]);
    });

    it("should store eventId when provided", () => {
      // 有効なeventレコードを作成してから参照する
      const eventInfo = ctx.db
        .prepare(
          `INSERT INTO events (event_type, source_type, content, content_hash, occurred_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("document_change", "markdown", "content", "hash123", "2024-01-01T00:00:00");
      const eventId = Number(eventInfo.lastInsertRowid);

      const path = "/notes/linked.md";
      repo.recordFileEvent(path, "created", eventId, "2024-01-01T00:00:00");

      const timeline = repo.getFileTimeline(path);
      expect(timeline[0].eventId).toBe(eventId);
    });
  });

  // ── スナップショット ──────────────────────────────────────────────

  describe("createSnapshot / getSnapshots", () => {
    it("should create and retrieve snapshots", () => {
      const snapshotAt = new Date().toISOString();
      const id = repo.createSnapshot(snapshotAt, {
        noteCount: 100,
        eventCount: 50,
        entityCount: 30,
      });
      expect(id).toBeGreaterThan(0);

      const snapshots = repo.getSnapshots();
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].noteCount).toBe(100);
      expect(snapshots[0].eventCount).toBe(50);
      expect(snapshots[0].entityCount).toBe(30);
    });

    it("should return snapshots ordered by snapshot_at DESC", () => {
      repo.createSnapshot("2024-01-01T00:00:00", { noteCount: 10, eventCount: 5, entityCount: 3 });
      repo.createSnapshot("2024-12-01T00:00:00", { noteCount: 100, eventCount: 50, entityCount: 30 });
      repo.createSnapshot("2024-06-01T00:00:00", { noteCount: 50, eventCount: 25, entityCount: 15 });

      const snapshots = repo.getSnapshots();
      expect(snapshots[0].snapshotAt).toBe("2024-12-01T00:00:00");
      expect(snapshots[1].snapshotAt).toBe("2024-06-01T00:00:00");
      expect(snapshots[2].snapshotAt).toBe("2024-01-01T00:00:00");
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        repo.createSnapshot(`2024-0${i + 1}-01T00:00:00`, {
          noteCount: i * 10,
          eventCount: i * 5,
          entityCount: i * 3,
        });
      }
      const snapshots = repo.getSnapshots(2);
      expect(snapshots.length).toBeLessThanOrEqual(2);
    });

    it("should return empty array when no snapshots exist", () => {
      const snapshots = repo.getSnapshots();
      expect(snapshots).toEqual([]);
    });
  });
});
