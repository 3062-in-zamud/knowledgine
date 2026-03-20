import { describe, it, expect } from "vitest";
import { EntityExtractor } from "../../src/graph/entity-extractor.js";
import type { ExtractionRules } from "../../src/feedback/feedback-learner.js";

describe("EntityExtractor with ExtractionRules", () => {
  describe("no rules (default behavior)", () => {
    it("should extract entities normally without rules", () => {
      const extractor = new EntityExtractor();
      const result = extractor.extract("Some content", { tags: ["typescript", "react"] });
      const names = result.map((e) => e.name);
      expect(names).toContain("typescript");
      expect(names).toContain("react");
    });
  });

  describe("entityBlacklist", () => {
    it("should filter out blacklisted entities", () => {
      const rules: ExtractionRules = {
        version: 1,
        updatedAt: new Date().toISOString(),
        stopWords: { added: [] },
        typeOverrides: [],
        entityBlacklist: ["typescript"],
        entityWhitelist: [],
      };
      const extractor = new EntityExtractor(rules);
      const result = extractor.extract("Some content", { tags: ["typescript", "react"] });
      const names = result.map((e) => e.name);
      expect(names).not.toContain("typescript");
      expect(names).toContain("react");
    });

    it("should not filter entities not in blacklist", () => {
      const rules: ExtractionRules = {
        version: 1,
        updatedAt: new Date().toISOString(),
        stopWords: { added: [] },
        typeOverrides: [],
        entityBlacklist: ["nonexistent"],
        entityWhitelist: [],
      };
      const extractor = new EntityExtractor(rules);
      const result = extractor.extract("Some content", { tags: ["typescript"] });
      expect(result.some((e) => e.name === "typescript")).toBe(true);
    });
  });

  describe("typeOverrides", () => {
    it("should override entity type when matching", () => {
      const rules: ExtractionRules = {
        version: 1,
        updatedAt: new Date().toISOString(),
        stopWords: { added: [] },
        typeOverrides: [{ name: "typescript", fromType: "technology", toType: "concept" }],
        entityBlacklist: [],
        entityWhitelist: [],
      };
      const extractor = new EntityExtractor(rules);
      const result = extractor.extract("Some content", { tags: ["typescript"] });
      const ts = result.find((e) => e.name === "typescript");
      expect(ts).toBeDefined();
      expect(ts!.entityType).toBe("concept");
    });

    it("should not override when fromType does not match", () => {
      const rules: ExtractionRules = {
        version: 1,
        updatedAt: new Date().toISOString(),
        stopWords: { added: [] },
        typeOverrides: [{ name: "typescript", fromType: "tool", toType: "concept" }],
        entityBlacklist: [],
        entityWhitelist: [],
      };
      const extractor = new EntityExtractor(rules);
      // Tags are extracted as "technology", not "tool"
      const result = extractor.extract("Some content", { tags: ["typescript"] });
      const ts = result.find((e) => e.name === "typescript");
      expect(ts).toBeDefined();
      expect(ts!.entityType).toBe("technology"); // unchanged
    });
  });

  describe("entityWhitelist", () => {
    it("should add whitelisted entities", () => {
      const rules: ExtractionRules = {
        version: 1,
        updatedAt: new Date().toISOString(),
        stopWords: { added: [] },
        typeOverrides: [],
        entityBlacklist: [],
        entityWhitelist: [{ name: "vitest", type: "technology" }],
      };
      const extractor = new EntityExtractor(rules);
      const result = extractor.extract("Some content");
      const vitest = result.find((e) => e.name === "vitest");
      expect(vitest).toBeDefined();
      expect(vitest!.entityType).toBe("technology");
      expect(vitest!.sourceType).toBe("whitelist");
    });

    it("should not duplicate if entity already extracted", () => {
      const rules: ExtractionRules = {
        version: 1,
        updatedAt: new Date().toISOString(),
        stopWords: { added: [] },
        typeOverrides: [],
        entityBlacklist: [],
        entityWhitelist: [{ name: "react", type: "technology" }],
      };
      const extractor = new EntityExtractor(rules);
      const result = extractor.extract("Some content", { tags: ["react"] });
      const reactEntities = result.filter((e) => e.name === "react" && e.entityType === "technology");
      expect(reactEntities).toHaveLength(1);
    });
  });

  describe("combined rules", () => {
    it("should apply blacklist, overrides, and whitelist together", () => {
      const rules: ExtractionRules = {
        version: 1,
        updatedAt: new Date().toISOString(),
        stopWords: { added: [] },
        typeOverrides: [{ name: "react", fromType: "technology", toType: "concept" }],
        entityBlacklist: ["nodejs"],
        entityWhitelist: [{ name: "vitest", type: "tool" }],
      };
      const extractor = new EntityExtractor(rules);
      const result = extractor.extract("Some content", {
        tags: ["react", "nodejs", "typescript"],
      });
      const names = result.map((e) => e.name);

      // nodejs should be filtered out
      expect(names).not.toContain("nodejs");

      // react should have overridden type
      const react = result.find((e) => e.name === "react");
      expect(react!.entityType).toBe("concept");

      // typescript should be unchanged
      const ts = result.find((e) => e.name === "typescript");
      expect(ts!.entityType).toBe("technology");

      // vitest should be added
      const vitest = result.find((e) => e.name === "vitest");
      expect(vitest).toBeDefined();
      expect(vitest!.entityType).toBe("tool");
    });
  });
});
