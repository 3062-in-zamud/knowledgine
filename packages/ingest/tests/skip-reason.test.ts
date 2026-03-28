import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { KnowledgeRepository, Migrator, ALL_MIGRATIONS } from "@knowledgine/core";
import { IngestEngine } from "../src/ingest-engine.js";
import { PluginRegistry } from "../src/plugin-registry.js";
import type {
  IngestPlugin,
  PluginManifest,
  TriggerConfig,
  PluginConfig,
  PluginInitResult,
  NormalizedEvent,
  SourceURI,
} from "../src/types.js";

/** Minimal plugin that yields a configurable list of events */
function createStubPlugin(events: NormalizedEvent[]): IngestPlugin {
  return {
    manifest: {
      id: "stub",
      name: "Stub",
      version: "0.0.1",
      schemes: ["stub://"],
      priority: 1,
    } as PluginManifest,
    triggers: [] as TriggerConfig[],
    async initialize(_config?: PluginConfig): Promise<PluginInitResult> {
      return { ok: true };
    },
    async *ingestAll(_sourcePath: SourceURI): AsyncGenerator<NormalizedEvent> {
      for (const e of events) yield e;
    },
    async *ingestIncremental(
      _sourcePath: SourceURI,
      _checkpoint: string,
    ): AsyncGenerator<NormalizedEvent> {
      // Incremental always yields nothing (simulates "already indexed")
      // Override per test if needed
    },
    async getCurrentCheckpoint(_sourcePath: SourceURI): Promise<string> {
      return "checkpoint-abc";
    },
    async dispose(): Promise<void> {},
  };
}

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    sourceUri: "stub://test/file.md",
    eventType: "document",
    title: "Test Document",
    content: "Some meaningful content here for testing purposes.",
    timestamp: new Date(),
    metadata: { sourcePlugin: "stub", sourceId: "test-001" },
    ...overrides,
  };
}

describe("IngestEngine skip reason", () => {
  let db: Database.Database;
  let repository: KnowledgeRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    repository = new KnowledgeRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("should report 'already_indexed' when incremental yields 0 events", async () => {
    const plugin = createStubPlugin([makeEvent()]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    // First ingest — full
    const first = await engine.ingest("stub", "/tmp/test");
    expect(first.processed).toBe(1);

    // Second ingest — incremental (cursor exists, 0 new events)
    const second = await engine.ingest("stub", "/tmp/test");
    expect(second.processed).toBe(0);
    expect(second.skipReason).toBe("already_indexed");
  });

  it("should report 'no_source_data' when full ingest yields 0 events", async () => {
    const emptyPlugin = createStubPlugin([]);
    const registry = new PluginRegistry();
    registry.register(emptyPlugin);

    const engine = new IngestEngine(registry, db, repository);

    const result = await engine.ingest("stub", "/tmp/test", { full: true });
    expect(result.processed).toBe(0);
    expect(result.skipReason).toBe("no_source_data");
  });

  it("should report 'all_filtered' when all events are skipped (empty content)", async () => {
    const filteredPlugin = createStubPlugin([
      makeEvent({ content: "" }),
      makeEvent({ content: "   " }),
    ]);
    const registry = new PluginRegistry();
    registry.register(filteredPlugin);

    const engine = new IngestEngine(registry, db, repository);

    const result = await engine.ingest("stub", "/tmp/test", { full: true });
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.skipReason).toBe("all_filtered");
  });

  it("should not set skipReason when events are processed", async () => {
    const plugin = createStubPlugin([makeEvent()]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    const result = await engine.ingest("stub", "/tmp/test");
    expect(result.processed).toBe(1);
    expect(result.skipReason).toBeUndefined();
  });

  it("should use ingestAll (not incremental) when --force/--full is used", async () => {
    const event1 = makeEvent({ sourceUri: "stub://test/file1.md", title: "Doc 1" });
    const event2 = makeEvent({
      sourceUri: "stub://test/file2.md",
      title: "Doc 2",
      content: "Different content for second event",
    });
    const plugin = createStubPlugin([event1]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    // First ingest — creates cursor
    const first = await engine.ingest("stub", "/tmp/test");
    expect(first.processed).toBe(1);

    // Second ingest without --full — incremental yields 0, so "already_indexed"
    const second = await engine.ingest("stub", "/tmp/test");
    expect(second.processed).toBe(0);
    expect(second.skipReason).toBe("already_indexed");

    // Replace plugin events with a new event to prove ingestAll is called
    // (stubPlugin always yields from ingestAll, incremental yields nothing)
    const plugin2 = createStubPlugin([event2]);
    const registry2 = new PluginRegistry();
    registry2.register(plugin2);
    const engine2 = new IngestEngine(registry2, db, repository);

    // Force re-ingest uses ingestAll path
    const forced = await engine2.ingest("stub", "/tmp/test", { full: true });
    expect(forced.processed).toBe(1);
    expect(forced.skipReason).toBeUndefined();
  });
});
