import { describe, it, expect, beforeEach } from "vitest";
import { RuleBasedClassifier } from "../../src/extraction/rule-based-classifier.js";
import type { ExtractedPattern } from "../../src/types.js";

function makePattern(content: string): ExtractedPattern {
  return { type: "problem", content, confidence: 0.7 };
}

describe("RuleBasedClassifier", () => {
  let classifier: RuleBasedClassifier;

  beforeEach(() => {
    classifier = new RuleBasedClassifier();
  });

  describe("classify", () => {
    it('should classify recurring_error with confidence 0.8 for "同じエラーagain"', () => {
      const pattern = makePattern("同じエラーがagain発生した");
      const results = classifier.classify(pattern);
      const recurringError = results.find((r) => r.category === "recurring_error");
      expect(recurringError).toBeDefined();
      expect(recurringError!.confidence).toBe(0.8);
    });

    it('should classify recurring_error for "繰り返し"', () => {
      const pattern = makePattern("この問題が繰り返し発生している");
      const results = classifier.classify(pattern);
      const recurringError = results.find((r) => r.category === "recurring_error");
      expect(recurringError).toBeDefined();
    });

    it('should classify solution_found with confidence 0.9 for "solved"', () => {
      const pattern = makePattern("The issue was solved");
      const results = classifier.classify(pattern);
      const solutionFound = results.find((r) => r.category === "solution_found");
      expect(solutionFound).toBeDefined();
      expect(solutionFound!.confidence).toBe(0.9);
    });

    it('should classify solution_found for "修正完了"', () => {
      const pattern = makePattern("バグの修正完了した");
      const results = classifier.classify(pattern);
      const solutionFound = results.find((r) => r.category === "solution_found");
      expect(solutionFound).toBeDefined();
    });

    it('should classify time_estimate with confidence 0.7 for "3h"', () => {
      const pattern = makePattern("Estimated 3h for this task");
      const results = classifier.classify(pattern);
      const timeEstimate = results.find((r) => r.category === "time_estimate");
      expect(timeEstimate).toBeDefined();
      expect(timeEstimate!.confidence).toBe(0.7);
    });

    it('should classify time_estimate for "見積: 5"', () => {
      const pattern = makePattern("見積: 5時間");
      const results = classifier.classify(pattern);
      const timeEstimate = results.find((r) => r.category === "time_estimate");
      expect(timeEstimate).toBeDefined();
    });

    it("should return multiple results when multiple categories match", () => {
      // "solved" matches solution_found, "3h" matches time_estimate
      const pattern = makePattern("solved in 3h");
      const results = classifier.classify(pattern);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty array when no rules match", () => {
      const pattern = makePattern("random unrelated text");
      const results = classifier.classify(pattern);
      expect(results).toEqual([]);
    });

    it("should include matchedRule as correct pattern string", () => {
      const pattern = makePattern("solved the issue");
      const results = classifier.classify(pattern);
      const solutionFound = results.find((r) => r.category === "solution_found");
      expect(solutionFound).toBeDefined();
      expect(typeof solutionFound!.matchedRule).toBe("string");
      expect(solutionFound!.matchedRule.length).toBeGreaterThan(0);
    });
  });

  describe("classifyPatterns", () => {
    it("should batch classify multiple patterns", () => {
      const patterns = [
        makePattern("solved the issue"),
        makePattern("問題が繰り返し発生"),
        makePattern("unrelated text"),
      ];
      const results = classifier.classifyPatterns(patterns);
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it("should return empty array for empty patterns array", () => {
      const results = classifier.classifyPatterns([]);
      expect(results).toEqual([]);
    });
  });
});
