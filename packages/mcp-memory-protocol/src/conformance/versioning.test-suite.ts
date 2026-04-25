// Optional capability: versioning (§8 / createVersion: true, includeVersionHistory)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { MemoryProvider } from "../provider.js";
import { shouldRunCapability, type RunConformanceOptions } from "./helpers.js";

export function registerVersioningTests(options: RunConformanceOptions): void {
  describe("versioning (§8) [capability: versioning]", () => {
    let provider: MemoryProvider;
    let provisioned = false;

    beforeEach(async (ctx) => {
      provider = await options.createProvider();
      provisioned = true;
      const caps = provider.capabilities();
      if (!shouldRunCapability(caps, options, "versioning")) {
        ctx.skip();
      }
    });

    afterEach(async () => {
      if (provisioned) {
        await options.teardown?.(provider);
        provisioned = false;
      }
    });

    it("update with createVersion=true creates a new id with incremented version", async () => {
      const seed = await provider.store({
        content: "Original content for versioning test",
        layer: "episodic",
      });
      const r = await provider.update({
        id: seed.id,
        content: "Updated versioned content",
        createVersion: true,
      });
      expect(r.id).not.toBe(seed.id);
      expect(r.version).toBe(seed.version + 1);
      expect(r.previousVersion).toBe(seed.version);
    });

    it("recall_memory excludes deprecated entries when includeVersionHistory=false", async () => {
      const seed = await provider.store({
        content: "Versioned recall — original",
        layer: "episodic",
      });
      await provider.update({
        id: seed.id,
        content: "Versioned recall — updated",
        createVersion: true,
      });
      const r = await provider.recall({
        filter: { memoryIds: [seed.id] },
        includeVersionHistory: false,
      });
      const deprecatedReturned = r.memories.filter((m) => m.deprecated === true);
      expect(deprecatedReturned.length).toBe(0);
    });
  });
}
