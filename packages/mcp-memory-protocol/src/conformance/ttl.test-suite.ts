// Optional capability: ttl (§9.2 lazy-expire)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryProtocolError } from "../errors.js";
import type { MemoryProvider } from "../provider.js";
import { shouldRunCapability, type RunConformanceOptions } from "./helpers.js";

const FAR_PAST_TTL = 1; // 1 second; tests intentionally wait past it.

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function registerTtlTests(options: RunConformanceOptions): void {
  describe("ttl (§9.2) [capability: ttl]", () => {
    let provider: MemoryProvider;
    let provisioned = false;

    beforeEach(async (ctx) => {
      provider = await options.createProvider();
      provisioned = true;
      const caps = provider.capabilities();
      if (!shouldRunCapability(caps, options, "ttl")) {
        ctx.skip();
      }
    });

    afterEach(async () => {
      if (provisioned) {
        await options.teardown?.(provider);
        provisioned = false;
      }
    });

    it("recall excludes expired rows after their ttl elapses", async () => {
      await provider.store({ content: "short-lived", layer: "episodic", ttl: FAR_PAST_TTL });
      // Wait long enough that expires_at < now().
      await sleep(FAR_PAST_TTL * 1000 + 50);
      const r = await provider.recall({ query: "short-lived" });
      const found = r.memories.find((m) => m.content === "short-lived");
      expect(found).toBeUndefined();
    });

    it("update on an expired entry throws MEMORY_NOT_FOUND", async () => {
      const seed = await provider.store({
        content: "soon to expire",
        layer: "episodic",
        ttl: FAR_PAST_TTL,
      });
      await sleep(FAR_PAST_TTL * 1000 + 50);
      let caught: unknown;
      try {
        await provider.update({
          id: seed.id,
          content: "would-be update",
          createVersion: false,
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MemoryProtocolError);
      expect((caught as MemoryProtocolError).code).toBe("MEMORY_NOT_FOUND");
    });

    it("forget on an expired entry throws MEMORY_NOT_FOUND", async () => {
      const seed = await provider.store({
        content: "soon to expire",
        layer: "episodic",
        ttl: FAR_PAST_TTL,
      });
      await sleep(FAR_PAST_TTL * 1000 + 50);
      let caught: unknown;
      try {
        await provider.forget({ id: seed.id });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MemoryProtocolError);
      expect((caught as MemoryProtocolError).code).toBe("MEMORY_NOT_FOUND");
    });

    it("entries without ttl never expire on their own", async () => {
      const seed = await provider.store({ content: "permanent", layer: "episodic" });
      const r = await provider.recall({ filter: { memoryIds: [seed.id] } });
      expect(r.memories.find((m) => m.id === seed.id)).toBeDefined();
    });
  });
}
