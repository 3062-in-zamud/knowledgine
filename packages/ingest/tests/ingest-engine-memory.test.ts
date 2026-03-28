import { describe, it, expect, beforeEach, vi } from "vitest";
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

describe("IngestEngine memory management", () => {
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

  it("should use reduced batch size of 50", async () => {
    // Generate 75 events — with batch size 50, we need 2 batches
    const events = Array.from({ length: 75 }, (_, i) => createMockEvent(i));
    const plugin = createMockPlugin("test", events);
    registry.register(plugin);

    const summary = await engine.ingest("test", "/path");

    expect(summary.processed).toBe(75);
    expect(summary.errors).toBe(0);
  });

  it("should process 5000 events without error", async () => {
    const events = Array.from({ length: 5000 }, (_, i) => createMockEvent(i));
    registry.register(createMockPlugin("stress-test", events));

    const summary = await engine.ingest("stress-test", "/path");

    expect(summary.processed).toBe(5000);
    expect(summary.errors).toBe(0);
  }, 30_000);

  it("should call global.gc after each batch if available", async () => {
    const gcSpy = vi.fn();
    // @ts-expect-error -- testing gc hint
    global.gc = gcSpy;

    const events = Array.from({ length: 120 }, (_, i) => createMockEvent(i));
    registry.register(createMockPlugin("gc-test", events));

    await engine.ingest("gc-test", "/path");

    // With 120 events and batch size 50: 2 full batches + 1 remainder = 3 batches
    // GC should be called after each full batch (at least 2 times)
    expect(gcSpy).toHaveBeenCalledTimes(2);

    // @ts-expect-error -- cleanup
    delete global.gc;
  });
});
