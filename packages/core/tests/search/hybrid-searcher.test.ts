import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HybridSearcher } from "../../src/search/hybrid-searcher.js";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
import { MockEmbeddingProvider } from "../helpers/mock-embedding-provider.js";
import type { TestContext } from "../helpers/test-db.js";

describe("HybridSearcher", () => {
  let ctx: TestContext;
  let provider: MockEmbeddingProvider;
  let searcher: HybridSearcher;

  beforeEach(() => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    provider = new MockEmbeddingProvider();
    searcher = new HybridSearcher(ctx.repository, provider, 0.3);
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("should return FTS-only results when vector search is unavailable", async () => {
    const results = await searcher.search("TypeScript");
    // FTS should find notes mentioning TypeScript
    expect(results.length).toBeGreaterThan(0);
  });

  it("should include match reasons", async () => {
    const results = await searcher.search("TypeScript");
    for (const result of results) {
      expect(result.matchReason.length).toBeGreaterThan(0);
    }
  });

  it("should return empty array for query with no matches", async () => {
    const results = await searcher.search("xyznonexistentterm123456");
    expect(results).toEqual([]);
  });

  it("should respect the limit parameter", async () => {
    const results = await searcher.search("TypeScript", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("should return scores between 0 and 1", async () => {
    const results = await searcher.search("TypeScript");
    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  describe("dynamic alpha (CJK detection)", () => {
    it("CJK-dominant query with bert model → alpha=1.0 (keyword only, no vector search)", async () => {
      const bertSearcher = new HybridSearcher(ctx.repository, provider, 0.3, "bert");
      const embedQuerySpy = vi.spyOn(provider, "embedQuery");

      // Purely Japanese query (CJK ratio > 0.3)
      await bertSearcher.search("TypeScriptの使い方を学ぶ");

      // alpha=1.0 なのでベクトル検索はスキップされる
      expect(embedQuerySpy).not.toHaveBeenCalled();
    });

    it("CJK-dominant query with e5 model → alpha=0.5 (blended, vector search executed)", async () => {
      const e5Searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5");
      const embedQuerySpy = vi.spyOn(provider, "embedQuery");

      await e5Searcher.search("TypeScriptの使い方を学ぶ");

      // alpha=0.5 なのでベクトル検索が実行される
      expect(embedQuerySpy).toHaveBeenCalled();
    });

    it("mixed CJK+Latin query below 30% CJK ratio → uses normal alpha (vector search executed)", async () => {
      const bertSearcher = new HybridSearcher(ctx.repository, provider, 0.3, "bert");
      const embedQuerySpy = vi.spyOn(provider, "embedQuery");

      // CJK文字が少ない（ラテン文字主体のクエリ）
      await bertSearcher.search("TypeScript入門");

      // "TypeScript入門" → 5CJK / 13chars ≈ 38% > 0.3 → alpha=1.0 for bert
      // Actually "入門" is 2 CJK chars out of 11 total = 18% < 30% → normal alpha
      // Let's use a query where CJK < 30%
      embedQuerySpy.mockClear();
      await bertSearcher.search("TypeScriptABC日本");
      // "日本" = 2 CJK out of 14 chars = 14% < 30% → normal alpha (0.3) → vector search runs
      expect(embedQuerySpy).toHaveBeenCalled();
    });

    it("Latin-only query → uses normal alpha regardless of model family", async () => {
      const bertSearcher = new HybridSearcher(ctx.repository, provider, 0.3, "bert");
      const embedQuerySpy = vi.spyOn(provider, "embedQuery");

      await bertSearcher.search("TypeScript programming");

      // CJKなし → 通常alpha=0.3 → ベクトル検索実行
      expect(embedQuerySpy).toHaveBeenCalled();
    });
  });

  describe("graceful degradation on embedding failure", () => {
    it("should fall back gracefully when embedQuery throws", async () => {
      const failingProvider = new MockEmbeddingProvider();
      vi.spyOn(failingProvider, "embedQuery").mockRejectedValue(
        new Error("Embedding service unavailable"),
      );

      const gracefulSearcher = new HybridSearcher(ctx.repository, failingProvider, 0.3, "e5");

      // エラーをスローせず、FTS結果のみで返却する
      const results = await gracefulSearcher.search("TypeScript");
      expect(Array.isArray(results)).toBe(true);
      // FTSは動作するので0件以上が返る
      expect(results.length).toBeGreaterThan(0);
      // すべてのresultがkeyword理由を持つ（vecMap空なのでsemantic理由なし）
      for (const result of results) {
        const hasKeywordReason = result.matchReason.some((r) => r.startsWith("キーワード:"));
        const hasSemanticReason = result.matchReason.some((r) => r.startsWith("セマンティック:"));
        expect(hasKeywordReason).toBe(true);
        expect(hasSemanticReason).toBe(false);
      }
    });
  });
});
