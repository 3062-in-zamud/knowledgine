// Conformance: forget_memory (§5.4)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryProtocolError } from "../errors.js";
import type { MemoryProvider } from "../provider.js";
import type { RunConformanceOptions } from "./helpers.js";

export function registerForgetTests(options: RunConformanceOptions): void {
  describe("forget_memory (§5.4)", () => {
    let provider: MemoryProvider;

    beforeEach(async () => {
      provider = await options.createProvider();
    });

    afterEach(async () => {
      await options.teardown?.(provider);
    });

    it("performs a soft delete (default)", async () => {
      const stored = await provider.store({ content: "Memory to soft-forget", layer: "episodic" });
      const r = await provider.forget({ id: stored.id, reason: "test soft forget" });
      expect(r.id).toBe(stored.id);
      expect(r.forgotten).toBe(true);
      expect(r.method).toBe("soft");
    });

    it("performs a hard delete when hard=true", async () => {
      const stored = await provider.store({ content: "Memory to hard-forget", layer: "episodic" });
      const r = await provider.forget({ id: stored.id, hard: true });
      expect(r.forgotten).toBe(true);
      expect(r.method).toBe("hard");
    });

    it("throws MEMORY_NOT_FOUND for a non-existent id", async () => {
      let caught: unknown;
      try {
        await provider.forget({ id: "non-existent-id-xyz" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MemoryProtocolError);
      expect((caught as MemoryProtocolError).code).toBe("MEMORY_NOT_FOUND");
    });
  });
}
