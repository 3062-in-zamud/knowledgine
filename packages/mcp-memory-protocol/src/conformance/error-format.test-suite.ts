// Conformance: error format (§7)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryProtocolError } from "../errors.js";
import type { MemoryProvider } from "../provider.js";
import type { RunConformanceOptions } from "./helpers.js";

export function registerErrorFormatTests(options: RunConformanceOptions): void {
  describe("error format (§7)", () => {
    let provider: MemoryProvider;

    beforeEach(async () => {
      provider = await options.createProvider();
    });

    afterEach(async () => {
      await options.teardown?.(provider);
    });

    it("throws MemoryProtocolError with code MEMORY_NOT_FOUND when forgetting a non-existent id", async () => {
      let caught: unknown;
      try {
        await provider.forget({ id: "nonexistent-id-for-conformance" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MemoryProtocolError);
      const err = caught as MemoryProtocolError;
      expect(err.code).toBe("MEMORY_NOT_FOUND");
      // The serialized message must be present and non-empty so MCP-layer
      // adapters can include it in the textual error response (§7.2).
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
    });

    it("throws MemoryProtocolError with code INVALID_CONTENT for empty content", async () => {
      let caught: unknown;
      try {
        await provider.store({ content: "" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(MemoryProtocolError);
      expect((caught as MemoryProtocolError).code).toBe("INVALID_CONTENT");
    });
  });
}
