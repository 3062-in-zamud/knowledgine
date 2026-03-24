import { describe, it, expect } from "vitest";
import { isDecisionPoint } from "../../../src/plugins/claude-sessions/decision-detector.js";

describe("isDecisionPoint", () => {
  // 日本語パターン
  it('should return true for text containing "理由は"', () => {
    expect(isDecisionPoint("この設計を選んだ理由はシンプルさです")).toBe(true);
  });

  it('should return true for text containing "トレードオフ"', () => {
    expect(isDecisionPoint("パフォーマンスとメモリのトレードオフを考慮しました")).toBe(true);
  });

  it('should return true for text containing "比較した結果"', () => {
    expect(isDecisionPoint("A と B を比較した結果、A を採用します")).toBe(true);
  });

  it('should return true for text containing "判断した"', () => {
    expect(isDecisionPoint("このアプローチが最適と判断した")).toBe(true);
  });

  it('should return true for text containing "選択した"', () => {
    expect(isDecisionPoint("PostgreSQL を選択した理由は信頼性です")).toBe(true);
  });

  it('should return true for text containing "ではなく"', () => {
    expect(isDecisionPoint("REST ではなく GraphQL を使います")).toBe(true);
  });

  it('should return true for text containing "代わりに"', () => {
    expect(isDecisionPoint("Redux の代わりに Zustand を使用します")).toBe(true);
  });

  // 英語パターン
  it('should return true for text containing "because"', () => {
    expect(isDecisionPoint("I chose this approach because it is simpler")).toBe(true);
  });

  it('should return true for text containing "tradeoff"', () => {
    expect(isDecisionPoint("There is a tradeoff between speed and accuracy")).toBe(true);
  });

  it('should return true for text containing "trade-off"', () => {
    expect(isDecisionPoint("The trade-off here is memory vs performance")).toBe(true);
  });

  it('should return true for text containing "alternative"', () => {
    expect(isDecisionPoint("An alternative would be to use Redis")).toBe(true);
  });

  it('should return true for text containing "instead of"', () => {
    expect(isDecisionPoint("Use TypeScript instead of JavaScript")).toBe(true);
  });

  it('should return true for text containing "chose"', () => {
    expect(isDecisionPoint("We chose React for its ecosystem")).toBe(true);
  });

  it('should return true for text containing "decided"', () => {
    expect(isDecisionPoint("We decided to use a monorepo structure")).toBe(true);
  });

  it('should return true for text containing "pros and cons"', () => {
    expect(isDecisionPoint("The pros and cons were carefully weighed")).toBe(true);
  });

  it('should return true for text containing "considered"', () => {
    expect(isDecisionPoint("We considered multiple options")).toBe(true);
  });

  it('should return true for text containing "compared"', () => {
    expect(isDecisionPoint("We compared three approaches")).toBe(true);
  });

  it('should return true for text containing "rationale"', () => {
    expect(isDecisionPoint("The rationale for this decision is as follows")).toBe(true);
  });

  // ケースインセンシティブ
  it("should be case insensitive", () => {
    expect(isDecisionPoint("BECAUSE it works")).toBe(true);
    expect(isDecisionPoint("Because I said so")).toBe(true);
  });

  // falsy なケース
  it('should return false for general response text ("Here is the code:")', () => {
    expect(isDecisionPoint("Here is the code:")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isDecisionPoint("")).toBe(false);
  });

  it("should return false for whitespace-only string", () => {
    expect(isDecisionPoint("   ")).toBe(false);
    expect(isDecisionPoint("\n\t")).toBe(false);
  });

  it("should return false for plain technical explanation without decision language", () => {
    expect(isDecisionPoint("The function returns an array of strings.")).toBe(false);
  });
});
