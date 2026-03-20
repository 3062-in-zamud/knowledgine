import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginRegistry } from "../src/plugin-registry.js";
import type { IngestPlugin } from "../src/types.js";

function makeMockPlugin(overrides?: Partial<IngestPlugin>): IngestPlugin {
  return {
    manifest: {
      id: "test",
      name: "Test Plugin",
      version: "1.0.0",
      schemes: ["test://"],
      priority: 0,
    },
    triggers: [{ type: "manual" }],
    initialize: vi.fn(async () => ({ ok: true })),
    ingestAll: vi.fn(async function* () {}),
    ingestIncremental: vi.fn(async function* () {}),
    getCurrentCheckpoint: vi.fn(async () => "0"),
    dispose: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("PluginRegistry", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe("register / has / size", () => {
    it("プラグインを登録できる", () => {
      const plugin = makeMockPlugin();
      registry.register(plugin);
      expect(registry.has("test")).toBe(true);
      expect(registry.size).toBe(1);
    });

    it("同じIDで再登録すると上書きされる", () => {
      const plugin1 = makeMockPlugin({ manifest: { id: "test", name: "Old", version: "1.0.0", schemes: [], priority: 0 } });
      const plugin2 = makeMockPlugin({ manifest: { id: "test", name: "New", version: "2.0.0", schemes: [], priority: 1 } });
      registry.register(plugin1);
      registry.register(plugin2);
      expect(registry.size).toBe(1);
      expect(registry.get("test")?.manifest.name).toBe("New");
    });
  });

  describe("unregister", () => {
    it("登録済みプラグインを削除できる", () => {
      registry.register(makeMockPlugin());
      const result = registry.unregister("test");
      expect(result).toBe(true);
      expect(registry.has("test")).toBe(false);
      expect(registry.size).toBe(0);
    });

    it("存在しないIDはfalseを返す", () => {
      const result = registry.unregister("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("get", () => {
    it("登録済みプラグインを取得できる", () => {
      const plugin = makeMockPlugin();
      registry.register(plugin);
      expect(registry.get("test")).toBe(plugin);
    });

    it("存在しないIDはundefinedを返す", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("getOrThrow", () => {
    it("登録済みプラグインを取得できる", () => {
      const plugin = makeMockPlugin();
      registry.register(plugin);
      expect(registry.getOrThrow("test")).toBe(plugin);
    });

    it("存在しないIDはエラーをスローする", () => {
      expect(() => registry.getOrThrow("nonexistent")).toThrowError(
        "Plugin not found: nonexistent"
      );
    });
  });

  describe("list", () => {
    it("登録済みプラグインの配列を返す", () => {
      const p1 = makeMockPlugin({ manifest: { id: "a", name: "A", version: "1.0.0", schemes: [], priority: 0 } });
      const p2 = makeMockPlugin({ manifest: { id: "b", name: "B", version: "1.0.0", schemes: [], priority: 0 } });
      registry.register(p1);
      registry.register(p2);
      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list).toContain(p1);
      expect(list).toContain(p2);
    });

    it("登録なしは空配列を返す", () => {
      expect(registry.list()).toEqual([]);
    });
  });

  describe("listByPriority", () => {
    it("優先度の高い順にソートされる", () => {
      const low = makeMockPlugin({ manifest: { id: "low", name: "Low", version: "1.0.0", schemes: [], priority: 0 } });
      const high = makeMockPlugin({ manifest: { id: "high", name: "High", version: "1.0.0", schemes: [], priority: 3 } });
      const mid = makeMockPlugin({ manifest: { id: "mid", name: "Mid", version: "1.0.0", schemes: [], priority: 2 } });
      registry.register(low);
      registry.register(high);
      registry.register(mid);
      const sorted = registry.listByPriority();
      expect(sorted[0]?.manifest.id).toBe("high");
      expect(sorted[1]?.manifest.id).toBe("mid");
      expect(sorted[2]?.manifest.id).toBe("low");
    });

    it("元のlistは変更されない（イミュータブル）", () => {
      const p1 = makeMockPlugin({ manifest: { id: "a", name: "A", version: "1.0.0", schemes: [], priority: 0 } });
      const p2 = makeMockPlugin({ manifest: { id: "b", name: "B", version: "1.0.0", schemes: [], priority: 1 } });
      registry.register(p1);
      registry.register(p2);
      const beforeSort = registry.list().map((p) => p.manifest.id);
      registry.listByPriority();
      const afterSort = registry.list().map((p) => p.manifest.id);
      expect(beforeSort).toEqual(afterSort);
    });
  });

  describe("disposeAll", () => {
    it("全プラグインのdisposeを呼び出してクリアする", async () => {
      const p1 = makeMockPlugin({ manifest: { id: "a", name: "A", version: "1.0.0", schemes: [], priority: 0 } });
      const p2 = makeMockPlugin({ manifest: { id: "b", name: "B", version: "1.0.0", schemes: [], priority: 0 } });
      registry.register(p1);
      registry.register(p2);
      await registry.disposeAll();
      expect(p1.dispose).toHaveBeenCalledOnce();
      expect(p2.dispose).toHaveBeenCalledOnce();
      expect(registry.size).toBe(0);
    });

    it("プラグインがゼロでもエラーなし", async () => {
      await expect(registry.disposeAll()).resolves.toBeUndefined();
    });
  });
});
