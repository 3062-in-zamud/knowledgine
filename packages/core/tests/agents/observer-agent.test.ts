import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ObserverAgent } from "../../src/agents/observer-agent.js";
import type { ObserverAgentDeps, ObserverAgentConfig } from "../../src/agents/observer-agent.js";
import { PatternExtractor } from "../../src/extraction/pattern-extractor.js";
import { EntityExtractor } from "../../src/graph/entity-extractor.js";
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
    content: "テストコンテンツ",
    frontmatter_json: null,
    created_at: now,
    updated_at: null,
    content_hash: null,
    version: null,
    supersedes: null,
    valid_from: now,
    deprecated: 0,
    deprecation_reason: null,
    extracted_at: null,
    code_location_json: null,
    ...overrides,
  };
}

// 有効なLLMレスポンスを生成
function makeLLMVectorResponse(
  vectors: Array<{ category: string; content: string; confidence: number }>,
): string {
  return JSON.stringify(vectors);
}

describe("ObserverAgent", () => {
  let ctx: TestContext;
  let patternExtractor: PatternExtractor;
  let entityExtractor: EntityExtractor;

  beforeEach(() => {
    ctx = createTestDb();
    patternExtractor = new PatternExtractor();
    entityExtractor = new EntityExtractor();
  });

  afterEach(() => {
    ctx.db.close();
  });

  // --- ケース 1: ルールベースのみモード ---

  describe("ルールベースのみモード (llmProvider=undefined)", () => {
    it("LLMなしでも6ベクトル分類が動作する", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "## 問題\nTypeScriptのビルドエラーが発生した\n## 解決策\ntsconfig.jsonを修正した",
        frontmatter_json: JSON.stringify({ tags: ["typescript"] }),
      });

      const result = await agent.observe(note);

      expect(result.noteId).toBe(note.id);
      expect(result.vectors).toBeInstanceOf(Array);
      expect(result.processingMode).toBe("rule");
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("processingModeがruleになる", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote());

      expect(result.processingMode).toBe("rule");
    });

    it("errorsフィールドが未定義またはundefined", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote());

      expect(result.errors).toBeUndefined();
    });
  });

  // --- ケース 2: 各カテゴリのfixture ---

  describe("カテゴリ分類ルール", () => {
    it("problem/solutionパターンからeventsベクトルが生成される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "## Problem\nサーバーが起動しない\n## Solution\nポート設定を変更した",
      });

      const result = await agent.observe(note);
      const eventVectors = result.vectors.filter((v) => v.category === "events");

      expect(eventVectors.length).toBeGreaterThan(0);
    });

    it("frontmatterのauthorからpersonal_infoベクトルが生成される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "開発ノート",
        frontmatter_json: JSON.stringify({ author: "alice", tags: ["javascript"] }),
      });

      const result = await agent.observe(note);
      const personalVectors = result.vectors.filter((v) => v.category === "personal_info");

      expect(personalVectors.length).toBeGreaterThan(0);
      expect(personalVectors.some((v) => v.content.includes("alice"))).toBe(true);
    });

    it("frontmatterのtagsからpreferencesベクトルが生成される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "設定メモ",
        frontmatter_json: JSON.stringify({ tags: ["react", "typescript"] }),
      });

      const result = await agent.observe(note);
      const prefVectors = result.vectors.filter((v) => v.category === "preferences");

      expect(prefVectors.length).toBeGreaterThan(0);
    });

    it("日付パターンからtemporal_dataベクトルが生成される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "2024-03-15にリリース予定。バージョンv2.3.0のリリース。",
      });

      const result = await agent.observe(note);
      const temporalVectors = result.vectors.filter((v) => v.category === "temporal_data");

      expect(temporalVectors.length).toBeGreaterThan(0);
    });

    it("learningパターンからeventsベクトルが生成される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "## 学び\nDockerのマルチステージビルドを使うとイメージサイズを削減できる",
      });

      const result = await agent.observe(note);
      const eventVectors = result.vectors.filter((v) => v.category === "events");

      expect(eventVectors.length).toBeGreaterThan(0);
    });

    it("EntityExtractorのpersonエンティティからpersonal_infoベクトルが生成される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "レビュアーは @bob-smith です",
        frontmatter_json: null,
      });

      const result = await agent.observe(note);
      const personalVectors = result.vectors.filter((v) => v.category === "personal_info");

      expect(personalVectors.length).toBeGreaterThan(0);
    });

    it("EntityExtractorのtechnologyエンティティからpreferencesベクトルが生成される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "`vitest`と`playwright`を使ったテスト環境を構築",
        frontmatter_json: null,
      });

      const result = await agent.observe(note);
      const prefVectors = result.vectors.filter((v) => v.category === "preferences");

      expect(prefVectors.length).toBeGreaterThan(0);
    });

    it("EntityExtractorのprojectエンティティからassistant_infoベクトルが生成される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "facebook/react のソースを読んだ",
        frontmatter_json: null,
      });

      const result = await agent.observe(note);
      const assistantVectors = result.vectors.filter((v) => v.category === "assistant_info");

      expect(assistantVectors.length).toBeGreaterThan(0);
    });
  });

  // --- ケース 3: LLM補完モード ---

  describe("LLM補完モード (hybridモード)", () => {
    it("LLMが利用可能な場合にhybridモードで動作する", async () => {
      const llmResponse = makeLLMVectorResponse([
        { category: "events", content: "デプロイ完了", confidence: 0.9 },
        { category: "preferences", content: "TypeScriptを好む", confidence: 0.8 },
      ]);
      const llm = new MockLLMProvider(llmResponse);

      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        llmProvider: llm,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote({ content: "デプロイ完了。TypeScriptを使用。" }));

      expect(result.processingMode).toBe("hybrid");
    });

    it("LLMのベクトルがルール結果にマージされる", async () => {
      const llmResponse = makeLLMVectorResponse([
        { category: "updates", content: "設定が変更された", confidence: 0.95 },
      ]);
      const llm = new MockLLMProvider(llmResponse);

      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        llmProvider: llm,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote({ content: "設定変更メモ" }));

      const updateVectors = result.vectors.filter((v) => v.category === "updates");
      expect(updateVectors.length).toBeGreaterThan(0);
      expect(updateVectors.some((v) => v.source === "llm")).toBe(true);
    });

    it("LLMプロバイダーが呼び出される", async () => {
      const llm = new MockLLMProvider("[]");

      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        llmProvider: llm,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      await agent.observe(makeNote({ content: "テスト".repeat(50) }));

      expect(llm.callCount).toBe(1);
    });
  });

  // --- ケース 4: LLMフォールバック ---

  describe("LLMフォールバック", () => {
    it("llmProvider未指定時にルールベースのみで動作する", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        // llmProvider: undefined
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote());

      expect(result.processingMode).toBe("rule");
    });

    it("LLMがisAvailable=falseの場合にルールベースフォールバック", async () => {
      const llm = new MockLLMProvider("[]", "mock-model", false);

      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        llmProvider: llm,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote());

      expect(result.processingMode).toBe("rule");
    });
  });

  // --- ケース 5: LLMエラー時フォールバック ---

  describe("LLMエラー時フォールバック", () => {
    it("complete()がthrowしてもルールベース結果で返却される", async () => {
      const llm = {
        complete: vi.fn().mockRejectedValue(new Error("LLM connection error")),
        isAvailable: vi.fn().mockResolvedValue(true),
        getModelName: vi.fn().mockReturnValue("mock"),
      };

      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        llmProvider: llm,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "## 問題\nエラー発生\n## 解決策\n修正した",
      });

      const result = await agent.observe(note);

      // エラーが発生してもresultは返る
      expect(result).toBeDefined();
      expect(result.noteId).toBe(note.id);
      // LLMエラーなので processingMode はrule
      expect(result.processingMode).toBe("rule");
    });

    it("LLMエラー時にerrorsフィールドにエラーが記録される", async () => {
      const llm = {
        complete: vi.fn().mockRejectedValue(new Error("timeout")),
        isAvailable: vi.fn().mockResolvedValue(true),
        getModelName: vi.fn().mockReturnValue("mock"),
      };

      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        llmProvider: llm,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote());

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  // --- ケース 6: LLM不正JSON応答 ---

  describe("LLM不正JSON応答", () => {
    it("パースできないレスポンス時にルールベースで返却", async () => {
      const llm = new MockLLMProvider("これはJSONではありません！");

      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        llmProvider: llm,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote());

      // パース失敗してもクラッシュしない
      expect(result).toBeDefined();
      expect(result.processingMode).toBe("rule");
    });

    it("不正なカテゴリ値を含むJSONはスキップされる", async () => {
      const llm = new MockLLMProvider(
        JSON.stringify([
          { category: "invalid_category", content: "foo", confidence: 0.5 },
          { category: "events", content: "正常なイベント", confidence: 0.8 },
        ]),
      );

      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        llmProvider: llm,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const result = await agent.observe(makeNote());

      // 不正なカテゴリはスキップ、正常なものは含まれる
      const invalidVectors = result.vectors.filter(
        (v) => v.category === ("invalid_category" as never),
      );
      expect(invalidVectors).toHaveLength(0);
    });
  });

  // --- ケース 7: observeBatch ---

  describe("observeBatch: 複数ノートの並列処理", () => {
    it("複数ノートを並列処理して結果リストを返す", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const notes = [
        makeNote({ id: 1, file_path: "note1.md" }),
        makeNote({ id: 2, file_path: "note2.md" }),
        makeNote({ id: 3, file_path: "note3.md" }),
      ];

      const results = await agent.observeBatch(notes);

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.noteId)).toEqual([1, 2, 3]);
    });

    it("空配列を渡すと空配列が返る", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const results = await agent.observeBatch([]);

      expect(results).toHaveLength(0);
    });

    it("maxConcurrencyが設定可能である", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const config: ObserverAgentConfig = { maxConcurrency: 2 };
      const agent = new ObserverAgent(deps, config);

      const notes = Array.from({ length: 5 }, (_, i) =>
        makeNote({ id: i + 1, file_path: `note-${i + 1}.md` }),
      );

      const results = await agent.observeBatch(notes);

      expect(results).toHaveLength(5);
    });
  });

  // --- ケース 8: observeBatch部分失敗 ---

  describe("observeBatch: 部分失敗", () => {
    it("1つのノートが内部エラーになっても他のノードは正常に処理される", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      // id=2のノートはcontent=null相当でエラーになる可能性があるが、
      // ObserverAgentは防御的に処理するため、errorsに記録して返す
      const notes = [
        makeNote({ id: 1, file_path: "note1.md", content: "正常なコンテンツ" }),
        makeNote({ id: 2, file_path: "note2.md", content: "" }),
        makeNote({ id: 3, file_path: "note3.md", content: "正常なコンテンツ2" }),
      ];

      const results = await agent.observeBatch(notes);

      // 全件返る（失敗はerrorsに記録）
      expect(results).toHaveLength(3);
      // id=1とid=3は正常
      const r1 = results.find((r) => r.noteId === 1);
      const r3 = results.find((r) => r.noteId === 3);
      expect(r1).toBeDefined();
      expect(r3).toBeDefined();
    });
  });

  // --- ベクトルの構造検証 ---

  describe("KnowledgeVectorの構造", () => {
    it("各ベクトルはcategory, content, confidence, sourceを持つ", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "## 問題\n障害発生\n## 解決策\nロールバック実施",
        frontmatter_json: JSON.stringify({ tags: ["incident"] }),
      });

      const result = await agent.observe(note);

      for (const vector of result.vectors) {
        expect(vector).toHaveProperty("category");
        expect(vector).toHaveProperty("content");
        expect(vector).toHaveProperty("confidence");
        expect(vector).toHaveProperty("source");
        expect(vector.confidence).toBeGreaterThanOrEqual(0);
        expect(vector.confidence).toBeLessThanOrEqual(1);
        expect(["rule", "llm"]).toContain(vector.source);
      }
    });

    it("有効なカテゴリ値のみが含まれる", async () => {
      const deps: ObserverAgentDeps = {
        patternExtractor,
        entityExtractor,
        repository: ctx.repository,
      };
      const agent = new ObserverAgent(deps);

      const note = makeNote({
        content: "開発日報。2024-01-15にv1.2.3リリース。@john-doe がレビュー。",
        frontmatter_json: JSON.stringify({ author: "jane", tags: ["typescript", "release"] }),
      });

      const result = await agent.observe(note);

      const validCategories = [
        "personal_info",
        "preferences",
        "events",
        "temporal_data",
        "updates",
        "assistant_info",
      ];

      for (const vector of result.vectors) {
        expect(validCategories).toContain(vector.category);
      }
    });
  });
});
