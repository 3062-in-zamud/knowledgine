import { describe, it, expect } from "vitest";
import {
  isI18nOnlyCommit,
  isDependabotCommit,
  isShortCommitMessage,
  classifyNoiseLevel,
} from "../src/noise-filter.js";

describe("noise-filter", () => {
  describe("isI18nOnlyCommit", () => {
    it("should detect i18n-only commits from relatedPaths", () => {
      expect(isI18nOnlyCommit(["locales/en.json", "locales/ja.json"])).toBe(true);
      expect(isI18nOnlyCommit(["translations/en.json"])).toBe(true);
      expect(isI18nOnlyCommit(["i18n/messages.json"])).toBe(true);
      expect(isI18nOnlyCommit(["src/i18n/en.json", "src/i18n/ja.json"])).toBe(true);
    });

    it("should return false for mixed commits", () => {
      expect(isI18nOnlyCommit(["locales/en.json", "src/index.ts"])).toBe(false);
    });

    it("should return false for non-i18n commits", () => {
      expect(isI18nOnlyCommit(["src/index.ts", "package.json"])).toBe(false);
    });

    it("should return false for empty paths", () => {
      expect(isI18nOnlyCommit([])).toBe(false);
    });
  });

  describe("isDependabotCommit", () => {
    it("should detect Dependabot commit subjects", () => {
      expect(isDependabotCommit("chore(deps): update dependency express to v4.18.2")).toBe(true);
      expect(isDependabotCommit("chore(deps-dev): bump typescript from 5.2.0 to 5.3.0")).toBe(true);
      expect(isDependabotCommit("Bump express from 4.17.0 to 4.18.2")).toBe(true);
      expect(isDependabotCommit("build(deps): bump lodash from 4.17.20 to 4.17.21")).toBe(true);
    });

    it("should detect Dependabot authors", () => {
      expect(isDependabotCommit("Update dependencies", "dependabot[bot]")).toBe(true);
      expect(isDependabotCommit("Update deps", "renovate[bot]")).toBe(true);
    });

    it("should not flag normal commits", () => {
      expect(isDependabotCommit("fix: resolve auth timeout")).toBe(false);
      expect(isDependabotCommit("feat: add new login flow")).toBe(false);
    });
  });

  describe("isShortCommitMessage", () => {
    it("should flag messages shorter than threshold", () => {
      expect(isShortCommitMessage("fix", 10)).toBe(true);
      expect(isShortCommitMessage("refac", 10)).toBe(true);
      expect(isShortCommitMessage("wip", 10)).toBe(true);
    });

    it("should not flag messages at or above threshold", () => {
      expect(isShortCommitMessage("fix: resolve timeout issue", 10)).toBe(false);
      expect(isShortCommitMessage("0123456789", 10)).toBe(false);
    });
  });

  describe("classifyNoiseLevel", () => {
    it("should classify i18n-only commits as noise", () => {
      const level = classifyNoiseLevel("update translations", "translator", ["locales/en.json"]);
      expect(level).toBe("noise");
    });

    it("should classify Dependabot commits as low-value", () => {
      const level = classifyNoiseLevel("chore(deps): bump express", "dependabot[bot]", [
        "package.json",
      ]);
      expect(level).toBe("low-value");
    });

    it("should classify short messages as low-value", () => {
      const level = classifyNoiseLevel("fix", "user", ["src/index.ts"]);
      expect(level).toBe("low-value");
    });

    it("should classify normal commits as normal", () => {
      const level = classifyNoiseLevel(
        "fix: resolve authentication timeout on mobile",
        "developer",
        ["src/auth.ts"],
      );
      expect(level).toBe("normal");
    });
  });
});
