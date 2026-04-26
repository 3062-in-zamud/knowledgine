// Conformance: store_memory (§5.1)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryProtocolError } from "../errors.js";
import type { MemoryProvider } from "../provider.js";
import type { RunConformanceOptions } from "./helpers.js";

export function registerStoreTests(options: RunConformanceOptions): void {
  describe("store_memory (§5.1)", () => {
    let provider: MemoryProvider;

    beforeEach(async () => {
      provider = await options.createProvider();
    });

    afterEach(async () => {
      await options.teardown?.(provider);
    });

    it("returns id, layer, version, createdAt for a basic store", async () => {
      const r = await provider.store({ content: "Test memory entry", layer: "episodic" });
      expect(typeof r.id).toBe("string");
      expect(r.id.length).toBeGreaterThan(0);
      expect(r.layer).toBe("episodic");
      expect(r.version).toBe(1);
      expect(typeof r.createdAt).toBe("string");
      expect(r.createdAt.length).toBeGreaterThan(0);
    });

    it("defaults to episodic layer when layer omitted", async () => {
      const r = await provider.store({ content: "No layer specified" });
      expect(r.layer).toBe("episodic");
    });

    it("throws INVALID_CONTENT for empty content", async () => {
      let caught: unknown;
      try {
        await provider.store({ content: "" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MemoryProtocolError);
      expect((caught as MemoryProtocolError).code).toBe("INVALID_CONTENT");
    });

    it("throws INVALID_LAYER for an invalid layer value", async () => {
      let caught: unknown;
      try {
        // Force an invalid layer past the type-system to exercise runtime
        // validation paths the conformance suite is responsible for.
        await provider.store({ content: "test", layer: "invalid_layer" as never });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MemoryProtocolError);
      expect((caught as MemoryProtocolError).code).toBe("INVALID_LAYER");
    });

    it("accepts tags and metadata", async () => {
      const r = await provider.store({
        content: "Memory with tags",
        tags: ["tag1", "tag2"],
        metadata: { source: "test", project: "conformance" },
      });
      expect(typeof r.id).toBe("string");
      expect(r.id.length).toBeGreaterThan(0);
    });
  });
}
