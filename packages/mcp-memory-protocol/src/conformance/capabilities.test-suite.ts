// Conformance: provider.capabilities() shape (§9.3)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { MemoryProvider } from "../provider.js";
import type { RunConformanceOptions } from "./helpers.js";

export function registerCapabilitiesTests(options: RunConformanceOptions): void {
  describe("capabilities (§9.3)", () => {
    let provider: MemoryProvider;

    beforeEach(async () => {
      provider = await options.createProvider();
    });

    afterEach(async () => {
      await options.teardown?.(provider);
    });

    it("provider.capabilities() returns the full MemoryProviderCapabilities shape", () => {
      const c = provider.capabilities();
      expect(typeof c.versioning).toBe("boolean");
      expect(typeof c.semanticSearch).toBe("boolean");
      expect(typeof c.layerPromotion).toBe("boolean");
      expect(typeof c.temporalQuery).toBe("boolean");
      expect(typeof c.ttl).toBe("boolean");
      expect(Array.isArray(c.supportedLayers)).toBe(true);
      expect(c.supportedLayers.length).toBeGreaterThan(0);
      for (const layer of c.supportedLayers) {
        expect(["episodic", "semantic", "procedural"]).toContain(layer);
      }
    });
  });
}
