// Conformance: recall_memory (§5.2)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { MemoryProvider } from "../provider.js";
import type { RunConformanceOptions } from "./helpers.js";

export function registerRecallTests(options: RunConformanceOptions): void {
  describe("recall_memory (§5.2)", () => {
    let provider: MemoryProvider;

    beforeEach(async () => {
      provider = await options.createProvider();
    });

    afterEach(async () => {
      await options.teardown?.(provider);
    });

    it("returns memories array plus totalCount/hasMore", async () => {
      await provider.store({ content: "Recall conformance test seed", layer: "episodic" });
      const r = await provider.recall({});
      expect(Array.isArray(r.memories)).toBe(true);
      expect(typeof r.totalCount).toBe("number");
      expect(typeof r.hasMore).toBe("boolean");
    });

    it("supports query string", async () => {
      await provider.store({
        content: "Recall conformance test seed about TypeScript",
        layer: "episodic",
      });
      const r = await provider.recall({ query: "TypeScript" });
      expect(Array.isArray(r.memories)).toBe(true);
    });

    it("each memory exposes the spec-required fields", async () => {
      await provider.store({
        content: "Recall conformance test seed about TypeScript",
        layer: "episodic",
        tags: ["conformance"],
      });
      const r = await provider.recall({ query: "TypeScript" });
      expect(r.memories.length).toBeGreaterThan(0);
      const m = r.memories[0];
      expect(typeof m.id).toBe("string");
      expect(typeof m.content).toBe("string");
      expect(typeof m.layer).toBe("string");
      expect(typeof m.version).toBe("number");
      expect(typeof m.accessCount).toBe("number");
      expect(Array.isArray(m.tags)).toBe(true);
      expect(typeof m.createdAt).toBe("string");
      expect(typeof m.deprecated).toBe("boolean");
      expect(typeof m.validFrom).toBe("string");
    });

    it("filters by layer", async () => {
      await provider.store({ content: "alpha", layer: "episodic" });
      await provider.store({ content: "beta", layer: "semantic" });
      const r = await provider.recall({ filter: { layer: "episodic" } });
      for (const m of r.memories) {
        expect(m.layer).toBe("episodic");
      }
    });

    it("respects the limit parameter", async () => {
      await provider.store({ content: "one", layer: "episodic" });
      await provider.store({ content: "two", layer: "episodic" });
      await provider.store({ content: "three", layer: "episodic" });
      const r = await provider.recall({ limit: 1 });
      expect(r.memories.length).toBeLessThanOrEqual(1);
    });

    it("increments accessCount on subsequent recall (SHOULD)", async () => {
      const stored = await provider.store({
        content: "AccessCount test seed",
        layer: "episodic",
      });
      const r1 = await provider.recall({ filter: { memoryIds: [stored.id] } });
      const before = r1.memories[0]?.accessCount ?? 0;
      await provider.recall({ filter: { memoryIds: [stored.id] } });
      const r2 = await provider.recall({ filter: { memoryIds: [stored.id] } });
      const after = r2.memories[0]?.accessCount ?? 0;
      expect(after).toBeGreaterThan(before);
    });
  });
}
