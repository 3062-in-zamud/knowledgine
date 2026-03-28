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

describe("Error counting accuracy", () => {
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

  it("should count skippedLargeDiff events separately from errors", async () => {
    const events: NormalizedEvent[] = [
      {
        sourceUri: "git://repo/commit/abc123",
        eventType: "change",
        title: "Normal commit",
        content: "Normal content",
        timestamp: new Date(),
        metadata: { sourcePlugin: "git-history", sourceId: "abc123" },
      },
      {
        sourceUri: "git://repo/commit/def456",
        eventType: "change",
        title: "Large diff commit",
        content: "Large diff content (metadata only)",
        timestamp: new Date(),
        metadata: {
          sourcePlugin: "git-history",
          sourceId: "def456",
          skippedReason: "large_diff",
        },
      },
    ];

    registry.register(createMockPlugin("git-history", events));
    const summary = await engine.ingest("git-history", "/path", { full: true });

    expect(summary.processed).toBe(2);
    expect(summary.skippedLargeDiff).toBe(1);
  });

  it("should count empty-content events as skipped", async () => {
    const events: NormalizedEvent[] = [
      {
        sourceUri: "mock://test/event/1",
        eventType: "document",
        title: "Normal",
        content: "Has content",
        timestamp: new Date(),
        metadata: { sourcePlugin: "test", sourceId: "1" },
      },
      {
        sourceUri: "mock://test/event/2",
        eventType: "document",
        title: "Empty",
        content: "",
        timestamp: new Date(),
        metadata: { sourcePlugin: "test", sourceId: "2" },
      },
      {
        sourceUri: "mock://test/event/3",
        eventType: "document",
        title: "Whitespace only",
        content: "   \n  ",
        timestamp: new Date(),
        metadata: { sourcePlugin: "test", sourceId: "3" },
      },
    ];

    registry.register(createMockPlugin("test", events));
    const summary = await engine.ingest("test", "/path", { full: true });

    expect(summary.processed).toBe(1);
    expect(summary.skipped).toBe(2);
  });

  it("should include skippedLargeDiff in summary even when errors is 0", async () => {
    const events: NormalizedEvent[] = [
      {
        sourceUri: "git://repo/commit/abc",
        eventType: "change",
        title: "Skipped commit",
        content: "Content present but diff was huge",
        timestamp: new Date(),
        metadata: {
          sourcePlugin: "git-history",
          sourceId: "abc",
          skippedReason: "large_diff",
        },
      },
    ];

    registry.register(createMockPlugin("git-history", events));
    const summary = await engine.ingest("git-history", "/path", { full: true });

    expect(summary.errors).toBe(0);
    expect(summary.skippedLargeDiff).toBe(1);
    expect(summary.processed).toBe(1);
  });
});
