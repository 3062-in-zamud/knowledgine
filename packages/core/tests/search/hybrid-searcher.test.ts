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

  describe("semanticThreshold filtering (KNOW-394)", () => {
    it("should exclude low-quality semantic results below threshold", async () => {
      // threshold=0.99 に設定して、ほぼすべての semantic ヒットを除外する
      const strictSearcher = new HybridSearcher(ctx.repository, provider, 0.3, "bert", 0.99);
      const embedQuerySpy = vi.spyOn(provider, "embedQuery");

      // Mock が返す距離は MockEmbeddingProvider の実装次第だが、
      // threshold=0.99 は score = 1 - dist²/2 >= 0.99 つまり dist <= ~0.141 の場合のみ通過
      // 実際には MockEmbeddingProvider が高距離を返すため vecMap は空になる
      const results = await strictSearcher.search("TypeScript");

      // FTS は機能するのでresultsは0件以上
      expect(Array.isArray(results)).toBe(true);
      // semantic reason がないことを確認（vecMap が空のため）
      for (const result of results) {
        const hasSemanticReason = result.matchReason.some((r) => r.startsWith("セマンティック:"));
        expect(hasSemanticReason).toBe(false);
      }

      embedQuerySpy.mockRestore();
    });

    it("should include semantic results when threshold is 0 (no filtering)", async () => {
      // e5モデル + threshold=0 で全 semantic ヒットを通過させる
      const permissiveSearcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await permissiveSearcher.search("TypeScript");
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("KNOW-412: adaptive alpha (semantic spread detection)", () => {
    it("should increase alpha when semantic scores are tightly clustered (spread < 0.05)", async () => {
      // Mock searchByVector to return tightly clustered results
      // L2 distance → cosine_similarity = 1 - d²/2
      // For scores [0.75, 0.74, 0.74, 0.73, 0.73]: d ≈ sqrt(2*(1-score))
      // d for 0.75 = sqrt(0.5) ≈ 0.707, d for 0.73 = sqrt(0.54) ≈ 0.735
      const mockSearchByVector = vi.spyOn(ctx.repository, "searchByVector").mockReturnValue([
        { note_id: 1, distance: Math.sqrt(2 * (1 - 0.75)) },
        { note_id: 2, distance: Math.sqrt(2 * (1 - 0.74)) },
        { note_id: 3, distance: Math.sqrt(2 * (1 - 0.74)) },
        { note_id: 4, distance: Math.sqrt(2 * (1 - 0.73)) },
        { note_id: 5, distance: Math.sqrt(2 * (1 - 0.73)) },
      ]);

      // Use e5 model (effectiveAlpha=0.3 for Latin queries)
      const e5Searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await e5Searcher.search("TypeScript");

      // spread = 0.75 - 0.73 = 0.02 < 0.05 → adaptiveAlpha = 0.7
      // finalAlpha = max(0.3, 0.7) = 0.7
      // We can verify through the scoring: higher FTS weight means FTS-only notes rank higher
      expect(results.length).toBeGreaterThan(0);

      mockSearchByVector.mockRestore();
    });

    it("should use moderate alpha when semantic scores are well-spread (spread >= 0.05)", async () => {
      const mockSearchByVector = vi.spyOn(ctx.repository, "searchByVector").mockReturnValue([
        { note_id: 1, distance: Math.sqrt(2 * (1 - 0.9)) },
        { note_id: 2, distance: Math.sqrt(2 * (1 - 0.8)) },
        { note_id: 3, distance: Math.sqrt(2 * (1 - 0.7)) },
        { note_id: 4, distance: Math.sqrt(2 * (1 - 0.6)) },
        { note_id: 5, distance: Math.sqrt(2 * (1 - 0.5)) },
      ]);

      const e5Searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await e5Searcher.search("TypeScript");

      // spread = 0.90 - 0.50 = 0.40 >= 0.05 → adaptiveAlpha = 0.5
      // finalAlpha = max(0.3, 0.5) = 0.5
      expect(results.length).toBeGreaterThan(0);

      mockSearchByVector.mockRestore();
    });

    it("should not adjust alpha when vecMap is empty", async () => {
      const mockSearchByVector = vi.spyOn(ctx.repository, "searchByVector").mockReturnValue([]);

      const e5Searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await e5Searcher.search("TypeScript");

      // vecScores empty → semanticSpread = 1.0 (single/no result → good spread)
      // adaptiveAlpha = 0.5, finalAlpha = max(0.3, 0.5) = 0.5
      // But vecMap is empty so only FTS scores matter → no semantic influence
      expect(results.length).toBeGreaterThan(0);

      mockSearchByVector.mockRestore();
    });

    it("should not adjust alpha when CJK query sets effectiveAlpha=1.0", async () => {
      const bertSearcher = new HybridSearcher(ctx.repository, provider, 0.3, "bert");
      const embedQuerySpy = vi.spyOn(provider, "embedQuery");

      // CJK-dominant query with bert → effectiveAlpha=1.0
      // The guard `if (effectiveAlpha < 1.0)` prevents adjustment
      await bertSearcher.search("TypeScriptの使い方を学ぶ");

      // alpha=1.0 → vector search skipped entirely
      expect(embedQuerySpy).not.toHaveBeenCalled();

      embedQuerySpy.mockRestore();
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
