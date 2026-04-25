// Conformance: update_memory (§5.3)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryProtocolError } from "../errors.js";
import type { MemoryProvider } from "../provider.js";
import type { RunConformanceOptions } from "./helpers.js";

export function registerUpdateTests(options: RunConformanceOptions): void {
  describe("update_memory (§5.3)", () => {
    let provider: MemoryProvider;

    beforeEach(async () => {
      provider = await options.createProvider();
    });

    afterEach(async () => {
      await options.teardown?.(provider);
    });

    it("performs an in-place update when createVersion=false", async () => {
      const stored = await provider.store({
        content: "Original content for update test",
        layer: "episodic",
      });
      const r = await provider.update({
        id: stored.id,
        content: "Updated content",
        createVersion: false,
      });
      expect(typeof r.id).toBe("string");
      expect(typeof r.version).toBe("number");
      expect(typeof r.updatedAt).toBe("string");
    });

    it("throws MEMORY_NOT_FOUND for a non-existent id", async () => {
      let caught: unknown;
      try {
        await provider.update({ id: "non-existent-id-xyz", content: "updated" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MemoryProtocolError);
      expect((caught as MemoryProtocolError).code).toBe("MEMORY_NOT_FOUND");
    });
  });
}
