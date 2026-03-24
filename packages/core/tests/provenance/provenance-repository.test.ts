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

describe("migration007: spec_alignment provenance", () => {
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

    it("should create provenance_links table", () => {
      const db = createDatabase(":memory:");
      new Migrator(db, ALL_MIGRATIONS).migrate();
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='provenance_links'")
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

    it("provenance table should have TEXT PRIMARY KEY (id)", () => {
      const db = createDatabase(":memory:");
      new Migrator(db, ALL_MIGRATIONS).migrate();
      // TEXT型のIDを直接挿入できることを確認
      const uuid = "test-uuid-1234-5678-abcd-ef0123456789";
      expect(() => {
        db.prepare(
          `INSERT INTO provenance (id, entity_uri, activity_type, generated_at) VALUES (?, ?, ?, ?)`,
        ).run(uuid, "file://test", "ingest", new Date().toISOString());
      }).not.toThrow();
      db.close();
    });
  });

  describe("Migration path: Wave 2 → Wave 3 → Wave 4", () => {
    it("should auto-apply all migrations on existing Wave 2 DB", () => {
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
      const expectedVersion = Math.max(...ALL_MIGRATIONS.map((m) => m.version));
      expect(new Migrator(db, ALL_MIGRATIONS).getCurrentVersion()).toBe(expectedVersion);

      // VIEWとテーブルの存在確認
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")
        .all();
      const names = (tables as Array<{ name: string }>).map((t) => t.name);
      expect(names).toContain("active_relations");
      expect(names).toContain("active_observations");
      expect(names).toContain("provenance");
      expect(names).toContain("provenance_links");
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
        sourceUri: "file://source.md",
        generatedAt: now,
      });
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);

      const records = repo.getByEntityUri("file://test.md");
      expect(records.length).toBe(1);
      expect(records[0].entityUri).toBe("file://test.md");
      expect(records[0].activityType).toBe("ingest");
      expect(records[0].agent).toBe("test-agent");
    });

    it("should return a UUID as the id", () => {
      const now = new Date().toISOString();
      const id = repo.record({
        entityUri: "file://uuid-test.md",
        activityType: "extract",
        generatedAt: now,
      });
      // UUID形式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("should store and retrieve sourceUri", () => {
      const now = new Date().toISOString();
      repo.record({
        entityUri: "file://source-uri-test.md",
        activityType: "extract",
        sourceUri: "file://source.md",
        generatedAt: now,
      });

      const records = repo.getByEntityUri("file://source-uri-test.md");
      expect(records[0].sourceUri).toBe("file://source.md");
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
        generatedAt: now,
        metadata: { model: "all-MiniLM", dimensions: 384 },
      });

      const records = repo.getByEntityUri("file://meta-test.md");
      expect(records[0].metadata).toEqual({ model: "all-MiniLM", dimensions: 384 });
    });

    it("should handle optional agent field", () => {
      const now = new Date().toISOString();
      repo.record({
        entityUri: "file://no-agent.md",
        activityType: "link",
        generatedAt: now,
      });

      const records = repo.getByEntityUri("file://no-agent.md");
      expect(records[0].agent).toBeUndefined();
    });
  });

  describe("getByAgent", () => {
    it("should retrieve records by agent", () => {
      const now = new Date().toISOString();
      repo.record({
        entityUri: "file://a.md",
        activityType: "ingest",
        agent: "agent-x",
        generatedAt: now,
      });
      repo.record({
        entityUri: "file://b.md",
        activityType: "ingest",
        agent: "agent-y",
        generatedAt: now,
      });
      repo.record({
        entityUri: "file://c.md",
        activityType: "ingest",
        agent: "agent-x",
        generatedAt: now,
      });

      const records = repo.getByAgent("agent-x");
      expect(records.length).toBe(2);
      expect(records.every((r) => r.agent === "agent-x")).toBe(true);
    });

    it("should respect limit", () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        repo.record({
          entityUri: `file://limit-${i}.md`,
          activityType: "ingest",
          agent: "limit-agent",
          generatedAt: now,
        });
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
      repo.record({
        entityUri: "file://extract-1.md",
        activityType: "extract",
        agent: "ex-agent",
        generatedAt: now,
      });
      repo.record({
        entityUri: "file://ingest-1.md",
        activityType: "ingest",
        agent: "in-agent",
        generatedAt: now,
      });

      const records = repo.getByActivity("extract");
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records.every((r) => r.activityType === "extract")).toBe(true);
    });

    it("should respect limit", () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        repo.record({
          entityUri: `file://act-${i}.md`,
          activityType: "embed",
          agent: "embedder",
          generatedAt: now,
        });
      }
      const records = repo.getByActivity("embed", 2);
      expect(records.length).toBeLessThanOrEqual(2);
    });
  });

  // ── プロベナンスリンク ─────────────────────────────────────────

  describe("createLink / findLinks", () => {
    it("should create and retrieve a link", () => {
      const now = new Date().toISOString();
      const id = repo.createLink("entity://a", "entity://b", "depends_on", now);
      expect(typeof id).toBe("string");
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const links = repo.findLinks("entity://a");
      expect(links.length).toBe(1);
      expect(links[0].fromEntityUri).toBe("entity://a");
      expect(links[0].toEntityUri).toBe("entity://b");
      expect(links[0].relation).toBe("depends_on");
    });

    it("should find links by toEntityUri", () => {
      const now = new Date().toISOString();
      repo.createLink("entity://a", "entity://c", "relates_to", now);
      repo.createLink("entity://b", "entity://c", "relates_to", now);

      const links = repo.findLinks(undefined, "entity://c");
      expect(links.length).toBe(2);
      expect(links.every((l) => l.toEntityUri === "entity://c")).toBe(true);
    });

    it("should find links by both fromEntityUri and toEntityUri", () => {
      const now = new Date().toISOString();
      repo.createLink("entity://a", "entity://b", "uses", now);
      repo.createLink("entity://a", "entity://c", "uses", now);

      const links = repo.findLinks("entity://a", "entity://b");
      expect(links.length).toBe(1);
      expect(links[0].toEntityUri).toBe("entity://b");
    });

    it("should return all links when no filter provided", () => {
      const now = new Date().toISOString();
      repo.createLink("entity://a", "entity://b", "uses", now);
      repo.createLink("entity://c", "entity://d", "extends", now);

      const links = repo.findLinks();
      expect(links.length).toBeGreaterThanOrEqual(2);
    });

    it("should return empty array when no matching links", () => {
      const links = repo.findLinks("entity://nonexistent");
      expect(links).toEqual([]);
    });

    it("should use auto-generated createdAt when not provided", () => {
      repo.createLink("entity://x", "entity://y", "linked_to");
      const links = repo.findLinks("entity://x");
      expect(links.length).toBe(1);
      expect(links[0].createdAt).toBeTruthy();
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
      expect(timeline[0].changeType).toBe("created");
      expect(timeline[1].changeType).toBe("modified");
      expect(timeline[2].changeType).toBe("modified");
      // 時系列順（ASC）
      expect(timeline[0].changedAt < timeline[1].changedAt).toBe(true);
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
      const path = "/notes/linked.md";
      const eventId = "evt-abc-123";
      repo.recordFileEvent(path, "created", eventId, "2024-01-01T00:00:00");

      const timeline = repo.getFileTimeline(path);
      expect(timeline[0].eventId).toBe(eventId);
    });

    it("should store empty string as eventId when not provided", () => {
      const path = "/notes/no-event.md";
      repo.recordFileEvent(path, "modified", undefined, "2024-01-01T00:00:00");

      const timeline = repo.getFileTimeline(path);
      expect(timeline[0].eventId).toBe("");
    });
  });

  // ── スナップショット ──────────────────────────────────────────────

  describe("createSnapshot / getSnapshots", () => {
    it("should create and retrieve snapshots", () => {
      const snapshotAt = new Date().toISOString();
      const id = repo.createSnapshot(snapshotAt, {
        entityCount: 30,
        eventCount: 50,
      });
      expect(typeof id).toBe("string");
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const snapshots = repo.getSnapshots();
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].eventCount).toBe(50);
      expect(snapshots[0].entityCount).toBe(30);
    });

    it("should return snapshots ordered by snapshot_at DESC", () => {
      repo.createSnapshot("2024-01-01T00:00:00", { entityCount: 3, eventCount: 5 });
      repo.createSnapshot("2024-12-01T00:00:00", { entityCount: 30, eventCount: 50 });
      repo.createSnapshot("2024-06-01T00:00:00", { entityCount: 15, eventCount: 25 });

      const snapshots = repo.getSnapshots();
      expect(snapshots[0].snapshotAt).toBe("2024-12-01T00:00:00");
      expect(snapshots[1].snapshotAt).toBe("2024-06-01T00:00:00");
      expect(snapshots[2].snapshotAt).toBe("2024-01-01T00:00:00");
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        repo.createSnapshot(`2024-0${i + 1}-01T00:00:00`, {
          entityCount: i * 3,
          eventCount: i * 5,
        });
      }
      const snapshots = repo.getSnapshots(2);
      expect(snapshots.length).toBeLessThanOrEqual(2);
    });

    it("should return empty array when no snapshots exist", () => {
      const snapshots = repo.getSnapshots();
      expect(snapshots).toEqual([]);
    });

    it("should store optional metadata", () => {
      const snapshotAt = new Date().toISOString();
      repo.createSnapshot(snapshotAt, { entityCount: 10, eventCount: 5 }, { version: "1.0" });

      const snapshots = repo.getSnapshots();
      expect(snapshots[0].metadata).toEqual({ version: "1.0" });
    });
  });
});
