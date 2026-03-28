import { describe, it, expect } from "vitest";
import { getHeapUsageRatio, getAdaptiveBatchSize } from "../src/heap-monitor.js";

describe("heap-monitor", () => {
  describe("getHeapUsageRatio", () => {
    it("should return a number between 0 and 1", () => {
      const ratio = getHeapUsageRatio();
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });
  });

  describe("getAdaptiveBatchSize", () => {
    it("should return the default batch size when heap usage is low", () => {
      const size = getAdaptiveBatchSize(50, 0.3);
      expect(size).toBe(50);
    });

    it("should halve batch size when heap usage exceeds 80%", () => {
      const size = getAdaptiveBatchSize(50, 0.85);
      expect(size).toBe(25);
    });

    it("should quarter batch size when heap usage exceeds 90%", () => {
      const size = getAdaptiveBatchSize(50, 0.95);
      expect(size).toBe(12);
    });

    it("should never return less than 1", () => {
      const size = getAdaptiveBatchSize(1, 0.99);
      expect(size).toBeGreaterThanOrEqual(1);
    });
  });
});
