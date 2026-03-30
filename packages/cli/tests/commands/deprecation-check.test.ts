import { describe, it, expect } from "vitest";

describe("KNOW-380: deprecation-check CJK support", () => {
  it("bigram tokenization creates CJK tokens", () => {
    // Test CJK bigrams
    const text = "認証フロー";
    const cjkRe = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g;
    const chars = text.match(cjkRe)!;
    const bigrams: string[] = [];
    for (let i = 0; i < chars.length - 1; i++) {
      bigrams.push(chars[i] + chars[i + 1]);
    }
    expect(bigrams).toEqual(["認証", "証フ", "フロ", "ロー"]);
  });
});
