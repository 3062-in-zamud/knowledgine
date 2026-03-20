import { describe, it, expect, vi } from "vitest";
import { IngestWatcher } from "../../src/lib/ingest-watcher.js";
import type { IngestEngine, IngestSummary, PluginRegistry, IngestPlugin, PluginManifest } from "@knowledgine/ingest";

function createMockPlugin(id: string): IngestPlugin {
  return {
    manifest: { id, name: id, version: "0.1.0", schemes: [], priority: 0 } as PluginManifest,
    triggers: [],
    initialize: vi.fn().mockResolvedValue({ ok: true }),
    ingestAll: vi.fn(),
    ingestIncremental: vi.fn(),
    getCurrentCheckpoint: vi.fn().mockResolvedValue("checkpoint"),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRegistry(plugins: IngestPlugin[]): PluginRegistry {
  return {
    list: () => plugins,
    get: (id: string) => plugins.find((p) => p.manifest.id === id),
    has: (id: string) => plugins.some((p) => p.manifest.id === id),
  } as unknown as PluginRegistry;
}

describe("IngestWatcher", () => {
  it("should run initial ingest for all plugins", async () => {
    const plugins = [createMockPlugin("a"), createMockPlugin("b")];
    const registry = createMockRegistry(plugins);
    const summaryA: IngestSummary = { pluginId: "a", processed: 5, errors: 0, elapsedMs: 100 };
    const summaryB: IngestSummary = { pluginId: "b", processed: 3, errors: 0, elapsedMs: 50 };

    const mockEngine = {
      ingest: vi.fn()
        .mockResolvedValueOnce(summaryA)
        .mockResolvedValueOnce(summaryB),
    } as unknown as IngestEngine;

    const onComplete = vi.fn();
    const watcher = new IngestWatcher({
      engine: mockEngine,
      registry,
      rootPath: "/tmp/test",
      onComplete,
    });

    const result = await watcher.runInitialIngest();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(summaryA);
    expect(result[1]).toEqual(summaryB);
    expect(onComplete).toHaveBeenCalledWith(result);
  });

  it("should continue when one plugin fails", async () => {
    const plugins = [createMockPlugin("a"), createMockPlugin("b")];
    const registry = createMockRegistry(plugins);
    const summaryB: IngestSummary = { pluginId: "b", processed: 3, errors: 0, elapsedMs: 50 };

    const mockEngine = {
      ingest: vi.fn()
        .mockRejectedValueOnce(new Error("plugin a failed"))
        .mockResolvedValueOnce(summaryB),
    } as unknown as IngestEngine;

    const onError = vi.fn();
    const watcher = new IngestWatcher({
      engine: mockEngine,
      registry,
      rootPath: "/tmp/test",
      onError,
    });

    const result = await watcher.runInitialIngest();
    expect(result).toHaveLength(2);
    expect(result[0].pluginId).toBe("a");
    expect(result[0].errors).toBe(1);
    expect(result[1]).toEqual(summaryB);
    expect(onError).toHaveBeenCalledWith("a", expect.any(Error));
  });

  it("should stop when stop() is called", async () => {
    const watcher = new IngestWatcher({
      engine: {} as IngestEngine,
      registry: createMockRegistry([]),
      rootPath: "/tmp/test",
    });

    await watcher.stop();
    // Should complete without error
  });

  it("should call onComplete callback with all summaries", async () => {
    const plugins = [createMockPlugin("a")];
    const registry = createMockRegistry(plugins);
    const summary: IngestSummary = { pluginId: "a", processed: 10, errors: 0, elapsedMs: 200 };

    const mockEngine = {
      ingest: vi.fn().mockResolvedValue(summary),
    } as unknown as IngestEngine;

    const onComplete = vi.fn();
    const watcher = new IngestWatcher({
      engine: mockEngine,
      registry,
      rootPath: "/tmp/test",
      onComplete,
    });

    await watcher.runInitialIngest();
    expect(onComplete).toHaveBeenCalledWith([summary]);
  });
});
