import { describe, it, expect, beforeEach } from "vitest";
import { ContextAnalyzer, ContextType } from "../../src/extraction/context-analyzer.js";

describe("ContextAnalyzer", () => {
  let analyzer: ContextAnalyzer;

  beforeEach(() => {
    analyzer = new ContextAnalyzer();
  });

  describe("analyzeContext", () => {
    it("should return SECTION_HEADER for heading lines", () => {
      expect(analyzer.analyzeContext("## My Heading", [])).toBe(ContextType.SECTION_HEADER);
      expect(analyzer.analyzeContext("# Title", [])).toBe(ContextType.SECTION_HEADER);
      expect(analyzer.analyzeContext("### Sub heading", [])).toBe(ContextType.SECTION_HEADER);
    });

    it("should return SECTION_HEADER when previous line is a heading", () => {
      const result = analyzer.analyzeContext("Content under heading", ["## Previous Heading"]);
      expect(result).toBe(ContextType.SECTION_HEADER);
    });

    it('should return LIST_ITEM for list items with "-"', () => {
      expect(analyzer.analyzeContext("- item", [])).toBe(ContextType.LIST_ITEM);
    });

    it('should return LIST_ITEM for list items with "*"', () => {
      expect(analyzer.analyzeContext("* item", [])).toBe(ContextType.LIST_ITEM);
    });

    it('should return LIST_ITEM for list items with "+"', () => {
      expect(analyzer.analyzeContext("+ item", [])).toBe(ContextType.LIST_ITEM);
    });

    it("should return CODE_COMMENT for comment lines starting with //", () => {
      expect(analyzer.analyzeContext("// this is a comment", [])).toBe(ContextType.CODE_COMMENT);
    });

    it("should return BODY_TEXT for normal text", () => {
      expect(analyzer.analyzeContext("This is normal body text", [])).toBe(ContextType.BODY_TEXT);
    });

    it("should handle empty previousLines", () => {
      const result = analyzer.analyzeContext("Normal text", []);
      expect(result).toBe(ContextType.BODY_TEXT);
    });
  });

  describe("calculateConfidence", () => {
    it("should apply 1.2 multiplier for SECTION_HEADER", () => {
      const result = analyzer.calculateConfidence(ContextType.SECTION_HEADER, 0.5);
      expect(result).toBeCloseTo(0.6);
    });

    it("should apply 1.0 multiplier for LIST_ITEM", () => {
      const result = analyzer.calculateConfidence(ContextType.LIST_ITEM, 0.7);
      expect(result).toBeCloseTo(0.7);
    });

    it("should apply 0.9 multiplier for BODY_TEXT", () => {
      const result = analyzer.calculateConfidence(ContextType.BODY_TEXT, 0.8);
      expect(result).toBeCloseTo(0.72);
    });

    it("should apply 0.8 multiplier for CODE_COMMENT", () => {
      const result = analyzer.calculateConfidence(ContextType.CODE_COMMENT, 0.8);
      expect(result).toBeCloseTo(0.64);
    });

    it("should cap confidence at 0.9", () => {
      // 0.85 * 1.2 = 1.02 -> capped at 0.9
      const result = analyzer.calculateConfidence(ContextType.SECTION_HEADER, 0.85);
      expect(result).toBe(0.9);
    });
  });

  describe("analyzeLineContext", () => {
    it("should return both type and confidence together", () => {
      const result = analyzer.analyzeLineContext("## Heading", [], 0.7);
      expect(result.type).toBe(ContextType.SECTION_HEADER);
      // 0.7 * 1.2 = 0.84, capped at 0.9
      expect(result.confidence).toBeCloseTo(0.84);
    });

    it("should work for body text", () => {
      const result = analyzer.analyzeLineContext("Regular text", [], 0.5);
      expect(result.type).toBe(ContextType.BODY_TEXT);
      // 0.5 * 0.9 = 0.45
      expect(result.confidence).toBeCloseTo(0.45);
    });
  });

  describe("getMultiplier", () => {
    it("should return 1.2 for SECTION_HEADER", () => {
      expect(analyzer.getMultiplier(ContextType.SECTION_HEADER)).toBe(1.2);
    });

    it("should return 1.0 for LIST_ITEM", () => {
      expect(analyzer.getMultiplier(ContextType.LIST_ITEM)).toBe(1.0);
    });

    it("should return 0.9 for BODY_TEXT", () => {
      expect(analyzer.getMultiplier(ContextType.BODY_TEXT)).toBe(0.9);
    });

    it("should return 0.8 for CODE_COMMENT", () => {
      expect(analyzer.getMultiplier(ContextType.CODE_COMMENT)).toBe(0.8);
    });
  });
});
