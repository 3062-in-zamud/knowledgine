/**
 * IngestEngine extraction integration tests (KNOW-324)
 * TDD: Write tests first (RED phase)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { Migrator, KnowledgeRepository, GraphRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { PluginRegistry } from "../src/plugin-registry.js";
import { IngestEngine } from "../src/ingest-engine.js";
import type { IngestPlugin, NormalizedEvent } from "../src/types.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
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

describe("IngestEngine extraction integration", () => {
  let db: Database.Database;
  let registry: PluginRegistry;
  let repository: KnowledgeRepository;
  let graphRepository: GraphRepository;

  beforeEach(() => {
    db = createTestDb();
    registry = new PluginRegistry();
    repository = new KnowledgeRepository(db);
    graphRepository = new GraphRepository(db);
  });

  it("should auto-extract when graphRepository is provided", async () => {
    const events = [createMockEvent(0), createMockEvent(1)];
    registry.register(createMockPlugin("test", events));

    const engine = new IngestEngine(registry, db, repository, graphRepository);
    const processSpy = vi.spyOn(
      (await import("@knowledgine/core")).IncrementalExtractor.prototype,
      "process",
    );

    const summary = await engine.ingest("test", "/path");

    expect(summary.noteIds!.length).toBeGreaterThan(0);
    expect(processSpy).toHaveBeenCalledWith(expect.arrayContaining(summary.noteIds!));
  });

  it("should skip extraction when graphRepository is absent", async () => {
    const events = [createMockEvent(0)];
    registry.register(createMockPlugin("test", events));

    // No graphRepository passed — old behavior
    const engine = new IngestEngine(registry, db, repository);
    const processSpy = vi.spyOn(
      (await import("@knowledgine/core")).IncrementalExtractor.prototype,
      "process",
    );

    await engine.ingest("test", "/path");

    expect(processSpy).not.toHaveBeenCalled();
  });

  it("should skip extraction when postProcessExtraction is false", async () => {
    const events = [createMockEvent(0)];
    registry.register(createMockPlugin("test", events));

    const engine = new IngestEngine(registry, db, repository, graphRepository);
    const processSpy = vi.spyOn(
      (await import("@knowledgine/core")).IncrementalExtractor.prototype,
      "process",
    );

    await engine.ingest("test", "/path", { postProcessExtraction: false });

    expect(processSpy).not.toHaveBeenCalled();
  });

  it("should include extractionSummary in result when extraction runs", async () => {
    const events = [createMockEvent(0)];
    registry.register(createMockPlugin("test", events));

    const engine = new IngestEngine(registry, db, repository, graphRepository);
    const summary = await engine.ingest("test", "/path");

    expect(summary).toHaveProperty("extractionSummary");
    expect(summary.extractionSummary).toBeDefined();
    expect(summary.extractionSummary).toMatchObject({
      processedNotes: expect.any(Number),
      totalEntities: expect.any(Number),
      totalRelations: expect.any(Number),
      totalPatterns: expect.any(Number),
      errors: expect.any(Number),
    });
  });

  it("should not include extractionSummary when no graphRepository", async () => {
    const events = [createMockEvent(0)];
    registry.register(createMockPlugin("test", events));

    const engine = new IngestEngine(registry, db, repository);
    const summary = await engine.ingest("test", "/path");

    expect(summary.extractionSummary).toBeUndefined();
  });

  it("should skip extraction when noteIds is empty even with graphRepository", async () => {
    // No events → no noteIds
    registry.register(createMockPlugin("test", []));

    const engine = new IngestEngine(registry, db, repository, graphRepository);
    const processSpy = vi.spyOn(
      (await import("@knowledgine/core")).IncrementalExtractor.prototype,
      "process",
    );

    await engine.ingest("test", "/path");

    expect(processSpy).not.toHaveBeenCalled();
  });
});
