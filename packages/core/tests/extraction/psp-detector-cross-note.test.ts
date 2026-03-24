import { describe, it, expect, beforeEach } from "vitest";
import { ProblemSolutionDetector } from "../../src/extraction/psp-detector.js";
import type { ExtractedPattern } from "../../src/types.js";

describe("ProblemSolutionDetector.detectPairsAcrossNotes", () => {
  let detector: ProblemSolutionDetector;

  beforeEach(() => {
    detector = new ProblemSolutionDetector();
  });

  const makePattern = (
    type: "problem" | "solution" | "learning" | "time",
    content: string,
    confidence = 0.8,
  ): ExtractedPattern => ({ type, content, confidence });

  it("should detect problem-solution pair between two notes", () => {
    const problemCreatedAt = "2024-01-01T00:00:00.000Z";
    const solutionCreatedAt = "2024-01-05T00:00:00.000Z"; // 4 days later

    const problemNote = {
      id: 1,
      patterns: [makePattern("problem", "TypeError undefined error in login module")],
    };
    const solutionNote = {
      id: 2,
      patterns: [makePattern("solution", "Fixed TypeError error by adding null check in login")],
      createdAt: solutionCreatedAt,
    };

    const pairs = detector.detectPairsAcrossNotes(problemNote, solutionNote, problemCreatedAt);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].problemNoteId).toBe(1);
    expect(pairs[0].solutionNoteId).toBe(2);
    expect(pairs[0].confidence).toBeGreaterThanOrEqual(0.3);
    expect(pairs[0].timeDiff).toBeCloseTo(4, 0);
  });

  it("should return empty array when timeDiff > 30 days", () => {
    const problemCreatedAt = "2024-01-01T00:00:00.000Z";
    const solutionCreatedAt = "2024-02-15T00:00:00.000Z"; // 45 days later

    const problemNote = {
      id: 1,
      patterns: [makePattern("problem", "database connection error timeout")],
    };
    const solutionNote = {
      id: 2,
      patterns: [makePattern("solution", "fixed database connection error timeout")],
      createdAt: solutionCreatedAt,
    };

    const pairs = detector.detectPairsAcrossNotes(problemNote, solutionNote, problemCreatedAt);
    expect(pairs).toEqual([]);
  });

  it("should return empty array when timeDiff < 0 (solution before problem)", () => {
    const problemCreatedAt = "2024-01-10T00:00:00.000Z";
    const solutionCreatedAt = "2024-01-05T00:00:00.000Z"; // 5 days BEFORE problem

    const problemNote = {
      id: 1,
      patterns: [makePattern("problem", "memory leak in event handler")],
    };
    const solutionNote = {
      id: 2,
      patterns: [makePattern("solution", "fixed memory leak in event handler")],
      createdAt: solutionCreatedAt,
    };

    const pairs = detector.detectPairsAcrossNotes(problemNote, solutionNote, problemCreatedAt);
    expect(pairs).toEqual([]);
  });

  it("should exclude pairs with keyword overlap < 0.3", () => {
    const problemCreatedAt = "2024-01-01T00:00:00.000Z";
    const solutionCreatedAt = "2024-01-03T00:00:00.000Z";

    const problemNote = {
      id: 1,
      patterns: [makePattern("problem", "authentication timeout exception occurred")],
    };
    const solutionNote = {
      id: 2,
      // Completely unrelated content - no keyword overlap
      patterns: [makePattern("solution", "updated css styles for button component")],
      createdAt: solutionCreatedAt,
    };

    const pairs = detector.detectPairsAcrossNotes(problemNote, solutionNote, problemCreatedAt);
    expect(pairs).toEqual([]);
  });

  it("should generate multiple pairs for multiple problem-solution combinations", () => {
    const problemCreatedAt = "2024-01-01T00:00:00.000Z";
    const solutionCreatedAt = "2024-01-02T00:00:00.000Z";

    const problemNote = {
      id: 1,
      patterns: [
        makePattern("problem", "network error connection refused"),
        makePattern("problem", "network timeout connection failed"),
      ],
    };
    const solutionNote = {
      id: 2,
      patterns: [
        makePattern("solution", "fixed network error by retry connection"),
        makePattern("solution", "resolved network timeout connection issue"),
      ],
      createdAt: solutionCreatedAt,
    };

    const pairs = detector.detectPairsAcrossNotes(problemNote, solutionNote, problemCreatedAt);
    // Should produce pairs with confidence >= 0.3
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair.confidence).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("should ignore patterns that are not problem or solution type", () => {
    const problemCreatedAt = "2024-01-01T00:00:00.000Z";
    const solutionCreatedAt = "2024-01-03T00:00:00.000Z";

    const problemNote = {
      id: 1,
      patterns: [
        makePattern("learning", "learned about error handling"),
        makePattern("time", "spent 2 hours debugging"),
      ],
    };
    const solutionNote = {
      id: 2,
      patterns: [
        makePattern("learning", "discovered better pattern"),
        makePattern("time", "completed in 30 minutes"),
      ],
      createdAt: solutionCreatedAt,
    };

    const pairs = detector.detectPairsAcrossNotes(problemNote, solutionNote, problemCreatedAt);
    expect(pairs).toEqual([]);
  });

  it("should return empty array for empty patterns", () => {
    const problemCreatedAt = "2024-01-01T00:00:00.000Z";
    const solutionCreatedAt = "2024-01-03T00:00:00.000Z";

    const problemNote = { id: 1, patterns: [] };
    const solutionNote = { id: 2, patterns: [], createdAt: solutionCreatedAt };

    const pairs = detector.detectPairsAcrossNotes(problemNote, solutionNote, problemCreatedAt);
    expect(pairs).toEqual([]);
  });
});
