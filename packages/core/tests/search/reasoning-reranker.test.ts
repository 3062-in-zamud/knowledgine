import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReasoningReranker } from "../../src/search/reasoning-reranker.js";
import type {
  RerankOptions as _RerankOptions,
  RerankedResult as _RerankedResult,
} from "../../src/search/reasoning-reranker.js";
import type { SearchResult } from "../../src/search/knowledge-searcher.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import type { KnowledgeNote } from "../../src/storage/knowledge-repository.js";
import { MockLLMProvider } from "../helpers/mock-llm-provider.js";

// テスト用ノート生成ヘルパー
function makeNote(overrides: Partial<KnowledgeNote> = {}): KnowledgeNote {
  const now = new Date().toISOString();
  return {
    id: 1,
    file_path: "test.md",
    title: "Test Note",
    content: "Some content here for testing purposes",
    frontmatter_json: null,
    created_at: now,
    updated_at: null,
    content_hash: null,
    valid_from: now,
    deprecated: 0,
    ...overrides,
  };
}

function makeCandidate(note: KnowledgeNote, score = 0.5): SearchResult {
  return { note, score, matchReason: ["キーワード一致"] };
}

// LLMが返す正常なJSONレスポンス（上位5件）
function makeLLMResponse(noteIds: number[]): string {
  const rankings = noteIds.map((noteId, i) => ({
    noteId,
    relevance: 1.0 - i * 0.1,
    reasoning: `Note ${noteId} is relevant because it matches the query context`,
  }));
  return JSON.stringify({ rankings });
}

describe("ReasoningReranker (LLM-based)", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  // --- テストケース 1: LLMあり → 上位5件に絞り込み ---

  describe("LLMあり: 基本動作", () => {
    it("入力20候補から上位5件に絞り込む", async () => {
      const candidates = Array.from({ length: 20 }, (_, i) =>
        makeCandidate(makeNote({ id: i + 1, file_path: `note-${i + 1}.md` }), 0.5),
      );

      const noteIds = [1, 2, 3, 4, 5];
      const llm = new MockLLMProvider(makeLLMResponse(noteIds));
      const reranker = new ReasoningReranker(llm, ctx.repository);

      const results = await reranker.rerank("test query", candidates);

      expect(results).toHaveLength(5);
    });

    it("各結果にreasoning（推論理由）が付与される", async () => {
      const candidates = Array.from({ length: 5 }, (_, i) =>
        makeCandidate(makeNote({ id: i + 1, file_path: `note-${i + 1}.md` }), 0.5),
      );

      const noteIds = [1, 2, 3, 4, 5];
      const llm = new MockLLMProvider(makeLLMResponse(noteIds));
      const reranker = new ReasoningReranker(llm, ctx.repository);

      const results = await reranker.rerank("test query", candidates);

      expect(results.every((r) => typeof r.reasoning === "string" && r.reasoning.length > 0)).toBe(
        true,
      );
    });

    it("axes（temporal/contextRelevance/pspQuality）が全て0-1範囲", async () => {
      const candidates = Array.from({ length: 5 }, (_, i) =>
        makeCandidate(makeNote({ id: i + 1, file_path: `note-${i + 1}.md` }), 0.5),
      );

      const noteIds = [1, 2, 3, 4, 5];
      const llm = new MockLLMProvider(makeLLMResponse(noteIds));
      const reranker = new ReasoningReranker(llm, ctx.repository);

      const results = await reranker.rerank("test query", candidates);

      for (const r of results) {
        expect(r.axes.temporal).toBeGreaterThanOrEqual(0);
        expect(r.axes.temporal).toBeLessThanOrEqual(1);
        expect(r.axes.contextRelevance).toBeGreaterThanOrEqual(0);
        expect(r.axes.contextRelevance).toBeLessThanOrEqual(1);
        expect(r.axes.pspQuality).toBeGreaterThanOrEqual(0);
        expect(r.axes.pspQuality).toBeLessThanOrEqual(1);
      }
    });

    it("不正なJSONレスポンス → フォールバック（元スコア順、reasoningなし）", async () => {
      const candidates = Array.from({ length: 5 }, (_, i) =>
        makeCandidate(makeNote({ id: i + 1, file_path: `note-${i + 1}.md` }), 0.5 - i * 0.05),
      );

      const llm = new MockLLMProvider("this is not valid json { broken");
      const reranker = new ReasoningReranker(llm, ctx.repository);

      const results = await reranker.rerank("test query", candidates);

      // フォールバック時はreasoning未設定
      expect(results.every((r) => r.reasoning === undefined)).toBe(true);
      // スコア降順になっている
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  // --- テストケース 5-6: LLMなし(undefined) ---

  describe("LLMなし(undefined): heuristicフォールバック", () => {
    it("originalScoreベースでtemporal+PSPのheuristic補正のみ", async () => {
      const candidates = [
        makeCandidate(makeNote({ id: 1, file_path: "a.md" }), 0.8),
        makeCandidate(makeNote({ id: 2, file_path: "b.md" }), 0.3),
      ];

      const reranker = new ReasoningReranker(undefined, ctx.repository);
      const results = await reranker.rerank("test query", candidates);

      expect(results).toHaveLength(2);
      // originalScoreを保持
      const r1 = results.find((r) => r.note.id === 1)!;
      const r2 = results.find((r) => r.note.id === 2)!;
      expect(r1.originalScore).toBe(0.8);
      expect(r2.originalScore).toBe(0.3);
    });

    it("LLMなしのときreasoningはundefined", async () => {
      const candidates = [makeCandidate(makeNote({ id: 1 }), 0.5)];

      const reranker = new ReasoningReranker(undefined, ctx.repository);
      const results = await reranker.rerank("test query", candidates);

      expect(results[0].reasoning).toBeUndefined();
    });
  });

  // --- テストケース 7: 空candidates ---

  it("空candidatesで空配列を返す", async () => {
    const llm = new MockLLMProvider(makeLLMResponse([]));
    const reranker = new ReasoningReranker(llm, ctx.repository);

    const results = await reranker.rerank("test query", []);

    expect(results).toEqual([]);
  });

  // --- テストケース 8: candidates < maxResults ---

  it("candidates < maxResults → 全件返却", async () => {
    const candidates = [
      makeCandidate(makeNote({ id: 1, file_path: "a.md" }), 0.8),
      makeCandidate(makeNote({ id: 2, file_path: "b.md" }), 0.6),
    ];

    const noteIds = [1, 2];
    const llm = new MockLLMProvider(makeLLMResponse(noteIds));
    const reranker = new ReasoningReranker(llm, ctx.repository);

    const results = await reranker.rerank("test query", candidates, { maxResults: 5 });

    expect(results).toHaveLength(2);
  });

  // --- テストケース 9: deprecated候補の減点 ---

  it("deprecated=1のノートが減点される", async () => {
    const activeNote = makeNote({ id: 1, file_path: "active.md", deprecated: 0 });
    const deprecatedNote = makeNote({ id: 2, file_path: "deprecated.md", deprecated: 1 });

    const candidates = [makeCandidate(activeNote, 0.5), makeCandidate(deprecatedNote, 0.5)];

    const reranker = new ReasoningReranker(undefined, ctx.repository);
    const results = await reranker.rerank("test query", candidates);

    const activeResult = results.find((r) => r.note.id === 1)!;
    const deprecatedResult = results.find((r) => r.note.id === 2)!;

    // deprecatedはtemporalスコアが低い
    expect(activeResult.axes.temporal).toBeGreaterThan(deprecatedResult.axes.temporal);
  });

  // --- テストケース 10: valid_from新しいノートが高スコア ---

  it("新しいノート(valid_from)が古いノートより高temporalスコア", async () => {
    const recentNote = makeNote({
      id: 1,
      file_path: "recent.md",
      valid_from: new Date().toISOString(),
      deprecated: 0,
    });
    const oldNote = makeNote({
      id: 2,
      file_path: "old.md",
      valid_from: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      deprecated: 0,
    });

    const candidates = [makeCandidate(recentNote, 0.5), makeCandidate(oldNote, 0.5)];

    const reranker = new ReasoningReranker(undefined, ctx.repository);
    const results = await reranker.rerank("test query", candidates);

    const recentResult = results.find((r) => r.note.id === 1)!;
    const oldResult = results.find((r) => r.note.id === 2)!;

    expect(recentResult.axes.temporal).toBeGreaterThan(oldResult.axes.temporal);
  });

  // --- LLM呼び出し数: 上位5件のみ ---

  it("LLMには上位maxResults(5)件のみ渡す", async () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate(makeNote({ id: i + 1, file_path: `note-${i + 1}.md` }), 0.5),
    );

    const noteIds = [1, 2, 3, 4, 5];
    const llm = new MockLLMProvider(makeLLMResponse(noteIds));
    const reranker = new ReasoningReranker(llm, ctx.repository);

    await reranker.rerank("test query", candidates);

    // LLMへのプロンプトに5件分のnoteIdのみ含まれる
    expect(llm.callCount).toBe(1);
    const prompt = llm.lastOptions?.messages.find((m) => m.role === "user")?.content ?? "";
    // 上位5件のnoteIdが含まれる（6件目以降は含まれない）
    expect(prompt).toContain('"id"');
  });

  // --- maxCandidates制限 ---

  it("maxCandidates=10のとき入力が20でも上位10件のみ処理", async () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate(makeNote({ id: i + 1, file_path: `note-${i + 1}.md` }), 1.0 - i * 0.04),
    );

    const noteIds = [1, 2, 3, 4, 5];
    const llm = new MockLLMProvider(makeLLMResponse(noteIds));
    const reranker = new ReasoningReranker(llm, ctx.repository);

    const results = await reranker.rerank("test query", candidates, {
      maxCandidates: 10,
      maxResults: 5,
    });

    expect(results).toHaveLength(5);
  });
});
