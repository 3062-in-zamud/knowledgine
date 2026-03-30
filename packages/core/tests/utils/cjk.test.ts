import { describe, it, expect } from "vitest";
import { hasCjk, cjkRatio, cjkCharCount } from "../../src/utils/cjk.js";

describe("CJK utilities", () => {
  describe("hasCjk", () => {
    it("detects Japanese hiragana", () => expect(hasCjk("あいう")).toBe(true));
    it("detects Japanese katakana", () => expect(hasCjk("アイウ")).toBe(true));
    it("detects Chinese characters", () => expect(hasCjk("认证")).toBe(true));
    it("detects Korean characters", () => expect(hasCjk("한글")).toBe(true));
    it("returns false for Latin text", () => expect(hasCjk("hello")).toBe(false));
    it("detects CJK in mixed text", () => expect(hasCjk("hello認証world")).toBe(true));
  });

  describe("cjkRatio", () => {
    it("returns 1.0 for pure CJK", () => expect(cjkRatio("認証")).toBe(1.0));
    it("returns 0.0 for Latin", () => expect(cjkRatio("hello")).toBe(0));
    it("returns correct ratio for mixed", () => {
      const ratio = cjkRatio("ab認証cd");
      expect(ratio).toBeCloseTo(2 / 6);
    });
    it("returns 0 for empty string", () => expect(cjkRatio("")).toBe(0));
  });

  describe("cjkCharCount", () => {
    it("counts CJK characters", () => expect(cjkCharCount("認証flow")).toBe(2));
    it("returns 0 for no CJK", () => expect(cjkCharCount("hello")).toBe(0));
  });
});
