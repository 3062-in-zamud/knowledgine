/**
 * IngestEngine の noteIds 集約テスト（Phase 0）
 * - processBatch の戻り値に noteIds が含まれる
 * - ingest の IngestSummary に noteIds が集約される
 * - IngestSummary.noteIds がない場合の後方互換
 */
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { PluginRegistry } from "../src/plugin-registry.js";
import { IngestEngine } from "../src/ingest-engine.js";
import type { IngestPlugin, NormalizedEvent } from "../src/types.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const migrator = new Migrator(db, ALL_MIGRATIONS);
  migrator.migrate();
  return db;
}

function createMockPlugin(id: string, events: NormalizedEvent[]): IngestPlugin {
  return {
    manifest: { id, name: `Mock ${id}`, version: "1.0.0", schemes: ["mock://"], priority: 0 },
    triggers: [{ type: "manual" as const }],
    initialize: async () => ({ ok: true }),
    ingestAll: async function* () {
      for (const e of events) yield e;
    },
    ingestIncremental: async function* (_uri: string, _cp: string) {
      for (const e of events) yield e;
    },
    getCurrentCheckpoint: async () => "test-checkpoint",
    dispose: async () => {},
  };
}

function createMockEvent(index: number): NormalizedEvent {
  return {
    sourceUri: `mock://test/event/${index}`,
    eventType: "document",
    title: `Test Event ${index}`,
    content: `Content for event ${index}`,
    timestamp: new Date(`2026-01-01T00:00:${String(index % 60).padStart(2, "0")}Z`),
    metadata: { sourcePlugin: "test", sourceId: `evt-${index}` },
  };
}

describe("IngestEngine: Phase 0 noteIds 集約", () => {
  let db: Database.Database;
  let registry: PluginRegistry;
  let repository: KnowledgeRepository;
  let engine: IngestEngine;

  beforeEach(() => {
    db = createTestDb();
    registry = new PluginRegistry();
    repository = new KnowledgeRepository(db);
    engine = new IngestEngine(registry, db, repository);
  });

  describe("ingest: IngestSummary に noteIds が含まれる", () => {
    it("ingest が返す IngestSummary に noteIds プロパティがある", async () => {
      const events = [createMockEvent(0), createMockEvent(1)];
      registry.register(createMockPlugin("test", events));

      const summary = await engine.ingest("test", "/path");

      expect(summary).toHaveProperty("noteIds");
    });

    it("noteIds は処理された件数と一致する", async () => {
      const events = [createMockEvent(0), createMockEvent(1), createMockEvent(2)];
      registry.register(createMockPlugin("test", events));

      const summary = await engine.ingest("test", "/path");

      expect(summary.noteIds).toBeDefined();
      expect(summary.noteIds!.length).toBe(summary.processed);
    });

    it("noteIds には全バッチにわたる note id が集約される", async () => {
      const events = [createMockEvent(0), createMockEvent(1)];
      registry.register(createMockPlugin("test", events));

      const summary = await engine.ingest("test", "/path");

      expect(summary.noteIds!.length).toBe(2);
      summary.noteIds!.forEach((id) => {
        expect(id).toBeGreaterThan(0);
      });
    });

    it("100件超のバッチ分割でも noteIds に全件集約される", async () => {
      const events = Array.from({ length: 150 }, (_, i) => createMockEvent(i));
      registry.register(createMockPlugin("test", events));

      const summary = await engine.ingest("test", "/path");

      expect(summary.processed).toBe(150);
      expect(summary.noteIds!.length).toBe(150);
    });

    it("イベントがゼロ件の場合 noteIds は空配列", async () => {
      registry.register(createMockPlugin("test", []));

      const summary = await engine.ingest("test", "/path");

      expect(summary.noteIds).toEqual([]);
    });
  });

  describe("IngestSummary: 後方互換", () => {
    it("noteIds はオプショナルなので既存フィールドは変わらない", async () => {
      const events = [createMockEvent(0)];
      registry.register(createMockPlugin("test", events));

      const summary = await engine.ingest("test", "/path");

      // 既存フィールドが引き続き存在する
      expect(summary.pluginId).toBe("test");
      expect(summary.processed).toBe(1);
      expect(summary.errors).toBe(0);
      expect(summary.deleted).toBeDefined();
      expect(summary.skipped).toBeDefined();
      expect(summary.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it("IngestSummary 型は noteIds?: number[] をオプショナルで持つ", async () => {
      // TypeScript の型チェックが通れば十分だが、実行時にも確認
      const events = [createMockEvent(0)];
      registry.register(createMockPlugin("test", events));

      const summary = await engine.ingest("test", "/path");

      // noteIds が undefined でも型エラーにならない（オプショナル）
      const noteIds: number[] | undefined = summary.noteIds;
      expect(noteIds).toBeDefined();
    });
  });
});
