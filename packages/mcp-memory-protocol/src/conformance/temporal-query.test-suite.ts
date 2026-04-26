// Optional capability: temporal_query (§8.2 Point-in-Time Recall)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { MemoryProvider } from "../provider.js";
import { shouldRunCapability, type RunConformanceOptions } from "./helpers.js";

/**
 * Sleep just long enough that subsequent ISO-8601 timestamps compare strictly
 * greater than the current Date.now(). Real DB clocks are millisecond-grained
 * so 5ms is a comfortable safety margin without slowing the suite noticeably.
 */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 5));
}

export function registerTemporalQueryTests(options: RunConformanceOptions): void {
  describe("temporal_query (§8.2) [capability: temporalQuery]", () => {
    let provider: MemoryProvider;
    let provisioned = false;

    beforeEach(async (ctx) => {
      provider = await options.createProvider();
      provisioned = true;
      const caps = provider.capabilities();
      if (!shouldRunCapability(caps, options, "temporalQuery")) {
        ctx.skip();
      }
    });

    afterEach(async () => {
      if (provisioned) {
        await options.teardown?.(provider);
        provisioned = false;
      }
    });

    it("recall(asOf=before-update) returns the original version of a chain", async () => {
      const seed = await provider.store({
        content: "chain root content",
        layer: "episodic",
      });
      // Record a moment after the seed exists but before any update.
      await tick();
      const beforeUpdate = new Date().toISOString();
      await tick();
      await provider.update({
        id: seed.id,
        content: "chain v2 content",
        createVersion: true,
      });

      const r = await provider.recall({ asOf: beforeUpdate });
      // Spec §8.2 step 4: a single chain produces exactly one row at any
      // historical asOf — the version that was current then.
      const seenIds = new Set(r.memories.map((m) => m.id));
      expect(seenIds.size).toBe(r.memories.length);
      const original = r.memories.find((m) => m.id === seed.id);
      expect(original).toBeDefined();
      expect(original?.content).toBe("chain root content");
    });

    it("recall(asOf=before-soft-forget) returns a soft-forgotten entry", async () => {
      const seed = await provider.store({
        content: "soon to be forgotten",
        layer: "episodic",
      });
      await tick();
      const beforeForget = new Date().toISOString();
      await tick();
      await provider.forget({ id: seed.id, reason: "test" });

      const r = await provider.recall({ asOf: beforeForget });
      const found = r.memories.find((m) => m.id === seed.id);
      expect(found).toBeDefined();
    });

    it("recall(asOf=after-soft-forget) excludes a soft-forgotten entry", async () => {
      const seed = await provider.store({
        content: "soon to be forgotten",
        layer: "episodic",
      });
      await tick();
      await provider.forget({ id: seed.id, reason: "test" });
      await tick();
      const afterForget = new Date().toISOString();

      const r = await provider.recall({ asOf: afterForget });
      const found = r.memories.find((m) => m.id === seed.id);
      expect(found).toBeUndefined();
    });
  });
}
