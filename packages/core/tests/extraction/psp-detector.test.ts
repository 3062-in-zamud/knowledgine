import { describe, it, expect, beforeEach } from "vitest";
import { ProblemSolutionDetector } from "../../src/extraction/psp-detector.js";

describe("ProblemSolutionDetector", () => {
  let detector: ProblemSolutionDetector;

  beforeEach(() => {
    detector = new ProblemSolutionDetector();
  });

  describe("detectPairsInNote", () => {
    const noteId = 1;

    it("should detect recurring_error + solution_found pair", () => {
      const patterns = [
        { id: 1, pattern_type: "problem", content: "error occurred" },
        { id: 2, pattern_type: "solution", content: "fixed the error" },
      ];
      const classifications = [
        { patternId: 1, category: "recurring_error", confidence: 0.8 },
        { patternId: 2, category: "solution_found", confidence: 0.9 },
      ];
      const pairs = detector.detectPairsInNote(noteId, patterns, classifications);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].problemPattern).toBe("error occurred");
      expect(pairs[0].solutionPattern).toBe("fixed the error");
    });

    it("should skip pairs where solution.id <= problem.id (reverse order)", () => {
      const patterns = [
        { id: 5, pattern_type: "solution", content: "fixed it" },
        { id: 3, pattern_type: "problem", content: "broken" },
      ];
      const classifications = [
        { patternId: 5, category: "solution_found", confidence: 0.9 },
        { patternId: 3, category: "recurring_error", confidence: 0.8 },
      ];
      // solution.id(5) > problem.id(3) => should be detected
      const pairs = detector.detectPairsInNote(noteId, patterns, classifications);
      expect(pairs).toHaveLength(1);
    });

    it("should skip when solution.id < problem.id", () => {
      const patterns = [
        { id: 10, pattern_type: "problem", content: "broken" },
        { id: 5, pattern_type: "solution", content: "fixed it" },
      ];
      const classifications = [
        { patternId: 10, category: "recurring_error", confidence: 0.8 },
        { patternId: 5, category: "solution_found", confidence: 0.9 },
      ];
      // solution.id(5) < problem.id(10) => should be skipped
      const pairs = detector.detectPairsInNote(noteId, patterns, classifications);
      expect(pairs).toHaveLength(0);
    });

    it("should set confidence = min(problem.confidence, solution.confidence)", () => {
      const patterns = [
        { id: 1, pattern_type: "problem", content: "problem" },
        { id: 2, pattern_type: "solution", content: "solution" },
      ];
      const classifications = [
        { patternId: 1, category: "recurring_error", confidence: 0.8 },
        { patternId: 2, category: "solution_found", confidence: 0.9 },
      ];
      const pairs = detector.detectPairsInNote(noteId, patterns, classifications);
      expect(pairs[0].confidence).toBe(0.8); // min(0.8, 0.9)
    });

    it("should produce n*m pairs for multiple problems and solutions", () => {
      const patterns = [
        { id: 1, pattern_type: "problem", content: "error1" },
        { id: 2, pattern_type: "problem", content: "error2" },
        { id: 3, pattern_type: "solution", content: "fix1" },
        { id: 4, pattern_type: "solution", content: "fix2" },
      ];
      const classifications = [
        { patternId: 1, category: "recurring_error", confidence: 0.8 },
        { patternId: 2, category: "recurring_error", confidence: 0.8 },
        { patternId: 3, category: "solution_found", confidence: 0.9 },
        { patternId: 4, category: "solution_found", confidence: 0.9 },
      ];
      const pairs = detector.detectPairsInNote(noteId, patterns, classifications);
      // 2 problems × 2 solutions = 4 pairs
      expect(pairs).toHaveLength(4);
    });

    it("should return empty when classifications are empty", () => {
      const patterns = [{ id: 1, pattern_type: "problem", content: "error" }];
      const pairs = detector.detectPairsInNote(noteId, patterns, []);
      expect(pairs).toEqual([]);
    });

    it("should return empty when patterns are empty", () => {
      const pairs = detector.detectPairsInNote(noteId, [], []);
      expect(pairs).toEqual([]);
    });

    it("should skip patterns whose patternId is not in classificationMap", () => {
      const patterns = [
        { id: 1, pattern_type: "problem", content: "error" },
        { id: 2, pattern_type: "solution", content: "fix" },
      ];
      const classifications = [
        { patternId: 99, category: "recurring_error", confidence: 0.8 }, // id 99 not in patterns
        { patternId: 2, category: "solution_found", confidence: 0.9 },
      ];
      const pairs = detector.detectPairsInNote(noteId, patterns, classifications);
      expect(pairs).toEqual([]);
    });

    it("should return empty when only recurring_error and no solution_found", () => {
      const patterns = [{ id: 1, pattern_type: "problem", content: "error" }];
      const classifications = [{ patternId: 1, category: "recurring_error", confidence: 0.8 }];
      const pairs = detector.detectPairsInNote(noteId, patterns, classifications);
      expect(pairs).toEqual([]);
    });

    it("should return empty when only solution_found and no recurring_error", () => {
      const patterns = [{ id: 1, pattern_type: "solution", content: "fix" }];
      const classifications = [{ patternId: 1, category: "solution_found", confidence: 0.9 }];
      const pairs = detector.detectPairsInNote(noteId, patterns, classifications);
      expect(pairs).toEqual([]);
    });
  });

  describe("detectPairsAcrossNotes", () => {
    it("should return empty array (TODO documented)", () => {
      const problemNote = { id: 1, patterns: [] };
      const solutionNote = { id: 2, patterns: [], createdAt: new Date().toISOString() };
      const result = detector.detectPairsAcrossNotes(
        problemNote,
        solutionNote,
        new Date().toISOString(),
      );
      expect(result).toEqual([]);
    });
  });
});
