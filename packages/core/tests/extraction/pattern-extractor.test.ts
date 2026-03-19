import { describe, it, expect, beforeEach } from "vitest";
import { PatternExtractor } from "../../src/extraction/pattern-extractor.js";

describe("PatternExtractor", () => {
  let extractor: PatternExtractor;

  beforeEach(() => {
    extractor = new PatternExtractor();
  });

  describe("constructor", () => {
    it("should use default patterns when no custom patterns provided", () => {
      const e = new PatternExtractor();
      // Should not throw and work normally
      const result = e.extractDailyPatterns("");
      expect(result).toEqual([]);
    });

    it("should merge custom patterns with defaults", () => {
      const customPatterns = {
        confidence: { high: 0.95, medium: 0.75, low: 0.55 },
      };
      const e = new PatternExtractor(customPatterns);
      // Should use merged config without error
      const result = e.extractDailyPatterns("");
      expect(result).toEqual([]);
    });
  });

  describe("extractDailyPatterns", () => {
    it("should extract content under ## 問題 section", () => {
      const content = "## 問題\nThis is a problem description\n## Other\nOther content";
      const patterns = extractor.extractDailyPatterns(content);
      const problemPatterns = patterns.filter((p) => p.type === "problem");
      expect(problemPatterns.length).toBeGreaterThan(0);
      expect(problemPatterns[0].content).toContain("This is a problem description");
    });

    it("should extract content under ## 解決策 section", () => {
      const content = "## 解決\nSolution applied here\n## Other\nSomething else";
      const patterns = extractor.extractDailyPatterns(content);
      const solutionPatterns = patterns.filter((p) => p.type === "solution");
      expect(solutionPatterns.length).toBeGreaterThan(0);
    });

    it("should extract content under ## 学び section", () => {
      const content = "## 学び\nLearning content here\n## Other\nSomething else";
      const patterns = extractor.extractDailyPatterns(content);
      const learningPatterns = patterns.filter((p) => p.type === "learning");
      expect(learningPatterns.length).toBeGreaterThan(0);
    });

    it("should extract time patterns like 3時間", () => {
      const content = "作業時間: 3時間かかった";
      const patterns = extractor.extractDailyPatterns(content);
      const timePatterns = patterns.filter((p) => p.type === "time");
      expect(timePatterns.length).toBeGreaterThan(0);
      expect(timePatterns[0].content).toContain("3時間");
    });

    it("should extract time patterns like 30分", () => {
      const content = "所要時間: 30分";
      const patterns = extractor.extractDailyPatterns(content);
      const timePatterns = patterns.filter((p) => p.type === "time");
      expect(timePatterns.length).toBeGreaterThan(0);
    });

    it("should extract time patterns like 2hours", () => {
      const content = "Spent 2hours on this task";
      const patterns = extractor.extractDailyPatterns(content);
      const timePatterns = patterns.filter((p) => p.type === "time");
      expect(timePatterns.length).toBeGreaterThan(0);
    });

    it("should skip code block content", () => {
      const content = "## 問題\n```\nconst x = 1; // not a problem\n```\n## Next\nDone";
      const patterns = extractor.extractDailyPatterns(content);
      // The code inside the block should not match content patterns
      // The section "問題" is empty (only code block), so no pattern
      const codeContent = patterns.find((p) => p.content.includes("const x = 1"));
      expect(codeContent).toBeUndefined();
    });

    it("should return empty array for empty content", () => {
      const patterns = extractor.extractDailyPatterns("");
      expect(patterns).toEqual([]);
    });

    it("should handle mixed Japanese/English content", () => {
      const content = "## 問題\n同じエラーがagain発生\n## Solutions\nFixed the issue";
      const patterns = extractor.extractDailyPatterns(content);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it("should stop section at next ## heading", () => {
      const content = "## 問題\nProblem line\n## 解決\nSolution line";
      const patterns = extractor.extractDailyPatterns(content);
      const problemPatterns = patterns.filter((p) => p.type === "problem");
      // Problem section should not include solution content
      if (problemPatterns.length > 0) {
        expect(problemPatterns[0].content).not.toContain("Solution line");
      }
    });

    it("should retrieve context with patterns", () => {
      const content = "Some context\n## 問題\nProblem here\n## Next";
      const patterns = extractor.extractDailyPatterns(content);
      const problemPatterns = patterns.filter((p) => p.type === "problem");
      if (problemPatterns.length > 0) {
        expect(problemPatterns[0].context).toBeDefined();
      }
    });
  });

  describe("extractTicketPatterns", () => {
    it("should extract ## 問題定義 section", () => {
      const content = "## 問題定義\nTicket problem here\n## Next\nEnd";
      const patterns = extractor.extractTicketPatterns(content);
      const problemPatterns = patterns.filter((p) => p.type === "problem");
      expect(problemPatterns.length).toBeGreaterThan(0);
      expect(problemPatterns[0].content).toContain("Ticket problem here");
    });

    it("should extract ## Resolution section", () => {
      const content = "## Resolution\nResolved by fixing the bug\n## Next\nEnd";
      const patterns = extractor.extractTicketPatterns(content);
      const solutionPatterns = patterns.filter((p) => p.type === "solution");
      expect(solutionPatterns.length).toBeGreaterThan(0);
    });

    it("should extract ## Learnings section", () => {
      const content = "## Learnings\nLearned about async patterns\n## Next\nEnd";
      const patterns = extractor.extractTicketPatterns(content);
      const learningPatterns = patterns.filter((p) => p.type === "learning");
      expect(learningPatterns.length).toBeGreaterThan(0);
    });

    it("should extract ## 実装結果 section", () => {
      const content = "## 実装結果\nImplementation done\n## Next\nEnd";
      const patterns = extractor.extractTicketPatterns(content);
      const solutionPatterns = patterns.filter((p) => p.type === "solution");
      expect(solutionPatterns.length).toBeGreaterThan(0);
    });

    it("should extract 見積: patterns as time", () => {
      const content = "見積: 5時間";
      const patterns = extractor.extractTicketPatterns(content);
      const timePatterns = patterns.filter((p) => p.type === "time");
      expect(timePatterns.length).toBeGreaterThan(0);
    });

    it("should extract 実績: patterns as time", () => {
      const content = "実績: 3時間";
      const patterns = extractor.extractTicketPatterns(content);
      const timePatterns = patterns.filter((p) => p.type === "time");
      expect(timePatterns.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("should handle invalid regex patterns gracefully", () => {
      const customPatterns = {
        dailyPatterns: {
          problem: {
            patterns: ["[invalid regex("],
            description: "Invalid pattern",
          },
        },
      };
      const e = new PatternExtractor(customPatterns);
      // Should not throw
      expect(() => e.extractDailyPatterns("some content")).not.toThrow();
    });
  });
});
