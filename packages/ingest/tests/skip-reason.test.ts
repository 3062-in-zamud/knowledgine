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

  it("should populate skippedByReason with empty_content when content is empty", async () => {
    const plugin = createStubPlugin([
      makeEvent({ content: "" }),
      makeEvent({ content: "   " }),
      makeEvent({ sourceUri: "stub://test/valid.md", content: "real content here" }),
    ]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    const result = await engine.ingest("stub", "/tmp/test", { full: true });
    expect(result.skipped).toBe(2);
    expect(result.skippedByReason).toBeDefined();
    expect(result.skippedByReason!.empty_content).toBe(2);
    expect(result.skippedByReason!.too_large).toBeUndefined();
    expect(result.skippedByReason!.excluded_pattern).toBeUndefined();
  });

  it("should populate skippedByReason with too_large when skippedReason is too_large", async () => {
    const plugin = createStubPlugin([
      makeEvent({
        content: "",
        metadata: { sourcePlugin: "stub", sourceId: "a", skippedReason: "too_large" },
      }),
      makeEvent({ sourceUri: "stub://test/valid.md", content: "valid content" }),
    ]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    const result = await engine.ingest("stub", "/tmp/test", { full: true });
    expect(result.skipped).toBe(1);
    expect(result.skippedByReason).toBeDefined();
    expect(result.skippedByReason!.too_large).toBe(1);
    expect(result.skippedByReason!.empty_content).toBeUndefined();
  });

  it("should populate skippedByReason with read_error when skippedReason is read_error", async () => {
    const plugin = createStubPlugin([
      makeEvent({
        content: "",
        metadata: { sourcePlugin: "stub", sourceId: "b", skippedReason: "read_error" },
      }),
    ]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    const result = await engine.ingest("stub", "/tmp/test", { full: true });
    expect(result.skipped).toBe(1);
    expect(result.skippedByReason).toBeDefined();
    expect(result.skippedByReason!.read_error).toBe(1);
  });

  it("should populate skippedByReason with excluded_pattern when excludePatterns matches", async () => {
    const plugin = createStubPlugin([
      makeEvent({
        sourceUri: "archive/old.md",
        relatedPaths: ["archive/old.md"],
        content: "some content",
      }),
      makeEvent({
        sourceUri: "docs/keep.md",
        relatedPaths: ["docs/keep.md"],
        content: "keep this",
      }),
    ]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    const result = await engine.ingest("stub", "/tmp/test", {
      full: true,
      excludePatterns: ["archive/**"],
    });
    expect(result.skipped).toBe(1);
    expect(result.skippedByReason).toBeDefined();
    expect(result.skippedByReason!.excluded_pattern).toBe(1);
  });

  it("should not set skippedByReason when no files are skipped", async () => {
    const plugin = createStubPlugin([makeEvent()]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    const result = await engine.ingest("stub", "/tmp/test", { full: true });
    expect(result.processed).toBe(1);
    expect(result.skippedByReason).toBeUndefined();
    expect(result.skipDetails).toBeUndefined();
  });

  it("should populate skipDetails only when verbose is true", async () => {
    const plugin = createStubPlugin([makeEvent({ content: "" })]);
    const registry = new PluginRegistry();
    registry.register(plugin);

    const engine = new IngestEngine(registry, db, repository);

    // verbose=false → no skipDetails
    const result = await engine.ingest("stub", "/tmp/test", { full: true, verbose: false });
    expect(result.skipDetails).toBeUndefined();

    // verbose=true → skipDetails populated
    const db2 = new Database(":memory:");
    new Migrator(db2, ALL_MIGRATIONS).migrate();
    const repository2 = new KnowledgeRepository(db2);
    const registry2 = new PluginRegistry();
    const plugin2 = createStubPlugin([makeEvent({ content: "" })]);
    registry2.register(plugin2);
    const engine2 = new IngestEngine(registry2, db2, repository2);

    const result2 = await engine2.ingest("stub", "/tmp/test", { full: true, verbose: true });
    expect(result2.skipDetails).toBeDefined();
    expect(result2.skipDetails!).toHaveLength(1);
    expect(result2.skipDetails![0].reason).toBe("empty_content");
    db2.close();
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
