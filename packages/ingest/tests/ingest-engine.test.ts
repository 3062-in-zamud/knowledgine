import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { PluginRegistry } from "../src/plugin-registry.js";
import { IngestEngine } from "../src/ingest-engine.js";
import { CursorStore } from "../src/cursor-store.js";
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

describe("IngestEngine", () => {
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

  describe("ingest", () => {
    it("プラグインが見つからない場合エラーをスロー", async () => {
      await expect(engine.ingest("nonexistent", "/path")).rejects.toThrow(
        "Plugin not found: nonexistent",
      );
    });

    it("full=trueでingestAllを使用する", async () => {
      const events = [createMockEvent(0), createMockEvent(1)];
      const plugin = createMockPlugin("test", events);
      const ingestAllSpy = vi.spyOn(plugin, "ingestAll");
      const ingestIncrementalSpy = vi.spyOn(plugin, "ingestIncremental");
      registry.register(plugin);

      await engine.ingest("test", "/path", { full: true });

      expect(ingestAllSpy).toHaveBeenCalled();
      expect(ingestIncrementalSpy).not.toHaveBeenCalled();
    });

    it("カーソルなし(初回)でingestAllを使用する", async () => {
      const events = [createMockEvent(0)];
      const plugin = createMockPlugin("test", events);
      const ingestAllSpy = vi.spyOn(plugin, "ingestAll");
      registry.register(plugin);

      await engine.ingest("test", "/path");

      expect(ingestAllSpy).toHaveBeenCalled();
    });

    it("カーソルありでingestIncrementalを使用する", async () => {
      const events = [createMockEvent(0)];
      const plugin = createMockPlugin("test", events);
      const ingestIncrementalSpy = vi.spyOn(plugin, "ingestIncremental");
      registry.register(plugin);

      // 事前にカーソルを保存
      const cursorStore = new CursorStore(db);
      cursorStore.saveCursor({
        pluginId: "test",
        sourcePath: "/path",
        checkpoint: "previous-checkpoint",
        lastIngestAt: new Date(),
      });

      await engine.ingest("test", "/path");

      expect(ingestIncrementalSpy).toHaveBeenCalledWith("/path", "previous-checkpoint");
    });

    it("処理後にカーソルを更新する", async () => {
      const events = [createMockEvent(0)];
      const plugin = createMockPlugin("test", events);
      registry.register(plugin);

      await engine.ingest("test", "/path");

      const cursorStore = new CursorStore(db);
      const cursor = cursorStore.getCursor("test", "/path");
      expect(cursor).toBeDefined();
      expect(cursor!.checkpoint).toBe("test-checkpoint");
    });

    it("IngestSummaryを返す", async () => {
      const events = [createMockEvent(0), createMockEvent(1), createMockEvent(2)];
      registry.register(createMockPlugin("test", events));

      const summary = await engine.ingest("test", "/path");

      expect(summary.pluginId).toBe("test");
      expect(summary.processed).toBe(3);
      expect(summary.errors).toBe(0);
      expect(summary.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("バッチ処理", () => {
    it("100件超でバッチ分割して処理する", async () => {
      const events = Array.from({ length: 150 }, (_, i) => createMockEvent(i));
      registry.register(createMockPlugin("test", events));

      const summary = await engine.ingest("test", "/path");

      expect(summary.processed).toBe(150);
      expect(summary.errors).toBe(0);
    });

    it("eventsテーブルにINSERTされる", async () => {
      const events = [createMockEvent(0), createMockEvent(1)];
      registry.register(createMockPlugin("test", events));

      await engine.ingest("test", "/path");

      const rows = db.prepare("SELECT count(*) as cnt FROM events").get() as { cnt: number };
      expect(rows.cnt).toBe(2);
    });
  });

  describe("エラー分離", () => {
    it("一部イベントが失敗しても他は継続処理される", async () => {
      const events = [
        createMockEvent(0),
        // 不正なイベント: contentが空
        { ...createMockEvent(1), content: "" },
        createMockEvent(2),
      ];
      registry.register(createMockPlugin("test", events));

      // content空はINSERT失敗するように saveNote を一部失敗させる
      const originalSaveNote = repository.saveNote.bind(repository);
      let callCount = 0;
      vi.spyOn(repository, "saveNote").mockImplementation((data) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Simulated failure");
        }
        return originalSaveNote(data);
      });

      const summary = await engine.ingest("test", "/path");

      // エラーが記録され、他は処理される
      expect(summary.errors).toBeGreaterThan(0);
    });
  });

  describe("ingestAll", () => {
    it("全登録プラグインを実行する", async () => {
      registry.register(createMockPlugin("plugin-a", [createMockEvent(0)]));
      registry.register(createMockPlugin("plugin-b", [createMockEvent(1)]));

      const results = await engine.ingestAll("/path");

      expect(results).toHaveLength(2);
      const pluginIds = results.map((r) => r.pluginId).sort();
      expect(pluginIds).toEqual(["plugin-a", "plugin-b"]);
    });

    it("プラグインなしは空配列を返す", async () => {
      const results = await engine.ingestAll("/path");
      expect(results).toEqual([]);
    });

    it("optionsをingestに渡す", async () => {
      const events = [createMockEvent(0)];
      const plugin = createMockPlugin("test", events);
      const ingestAllSpy = vi.spyOn(plugin, "ingestAll");
      registry.register(plugin);

      await engine.ingestAll("/path", { full: true });

      expect(ingestAllSpy).toHaveBeenCalled();
    });
  });

  describe("パフォーマンス", () => {
    it("1000件のNormalizedEventを5秒以内に処理する", async () => {
      const events = Array.from({ length: 1000 }, (_, i) => createMockEvent(i));
      registry.register(createMockPlugin("perf-test", events));

      const start = Date.now();
      const summary = await engine.ingest("perf-test", "/path");
      const elapsed = Date.now() - start;

      expect(summary.processed).toBe(1000);
      expect(elapsed).toBeLessThan(5000);
    }, 10_000);
  });
});
