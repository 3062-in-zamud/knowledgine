import { describe, it, expect } from "vitest";
import {
  CHANGELOG_PATTERN,
  CHANGELOG_DISCOUNT,
  LOW_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_DISCOUNT,
  BOT_AUTHOR_PATTERN,
  isChangelogOrReadme,
  applyScoreDiscounts,
} from "../../src/search/score-adjustments.js";

describe("score-adjustments", () => {
  describe("CHANGELOG_PATTERN", () => {
    it.each([
      "CHANGELOG.md",
      "CHANGELOG.txt",
      "CHANGELOG.rst",
      "changelog.md",
      "CHANGES.md",
      "CHANGES.txt",
      "HISTORY.md",
      "HISTORY.rst",
      "README.md",
      "README.txt",
      "readme.md",
    ])("should match %s", (filename) => {
      expect(CHANGELOG_PATTERN.test(filename)).toBe(true);
    });

    it.each(["src/app.ts", "docs/guide.md", "CHANGELOG", "README", "package.json"])(
      "should not match %s",
      (filename) => {
        expect(CHANGELOG_PATTERN.test(filename)).toBe(false);
      },
    );
  });

  describe("BOT_AUTHOR_PATTERN", () => {
    it.each(["dependabot[bot]", "renovate[bot]", "netlify[bot]", "custom-ci[bot]"])(
      "should match %s",
      (author) => {
        expect(BOT_AUTHOR_PATTERN.test(author)).toBe(true);
      },
    );

    it.each(["john", "bot", "user[bot]extra", ""])("should not match %s", (author) => {
      expect(BOT_AUTHOR_PATTERN.test(author)).toBe(false);
    });
  });

  describe("isChangelogOrReadme", () => {
    it("should detect CHANGELOG.md in a path", () => {
      expect(isChangelogOrReadme("docs/CHANGELOG.md")).toBe(true);
    });

    it("should detect README.md in a path", () => {
      expect(isChangelogOrReadme("README.md")).toBe(true);
    });

    it("should not match normal files", () => {
      expect(isChangelogOrReadme("src/index.ts")).toBe(false);
    });
  });

  describe("applyScoreDiscounts", () => {
    it("should apply CHANGELOG discount (0.3x)", () => {
      const score = applyScoreDiscounts(1.0, {
        filePath: "CHANGELOG.md",
        confidence: null,
      });
      expect(score).toBeCloseTo(CHANGELOG_DISCOUNT);
    });

    it("should apply low-confidence discount (0.5x)", () => {
      const score = applyScoreDiscounts(1.0, {
        filePath: "src/app.ts",
        confidence: 0.2,
      });
      expect(score).toBeCloseTo(LOW_CONFIDENCE_DISCOUNT);
    });

    it("should apply both discounts (0.3 * 0.5 = 0.15x)", () => {
      const score = applyScoreDiscounts(1.0, {
        filePath: "CHANGELOG.md",
        confidence: 0.1,
      });
      expect(score).toBeCloseTo(CHANGELOG_DISCOUNT * LOW_CONFIDENCE_DISCOUNT);
    });

    it("should not discount when confidence is null", () => {
      const score = applyScoreDiscounts(1.0, {
        filePath: "src/app.ts",
        confidence: null,
      });
      expect(score).toBe(1.0);
    });

    it("should not discount when confidence is above threshold", () => {
      const score = applyScoreDiscounts(1.0, {
        filePath: "src/app.ts",
        confidence: 0.8,
      });
      expect(score).toBe(1.0);
    });

    it("should discount at exact threshold boundary", () => {
      const score = applyScoreDiscounts(1.0, {
        filePath: "src/app.ts",
        confidence: LOW_CONFIDENCE_THRESHOLD,
      });
      expect(score).toBeCloseTo(LOW_CONFIDENCE_DISCOUNT);
    });

    it("should preserve score ordering", () => {
      const highScore = applyScoreDiscounts(0.9, {
        filePath: "src/app.ts",
        confidence: null,
      });
      const lowScore = applyScoreDiscounts(0.9, {
        filePath: "CHANGELOG.md",
        confidence: null,
      });
      expect(highScore).toBeGreaterThan(lowScore);
    });
  });
});
