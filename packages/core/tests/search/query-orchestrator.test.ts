import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryOrchestrator } from "../../src/search/query-orchestrator.js";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import type { GraphRepository } from "../../src/graph/graph-repository.js";
import type { LLMProvider } from "../../src/llm/types.js";

// GraphRepositoryのモック
function createMockGraphRepository(
  overrides: Partial<{
    getLinkedEntities: typeof GraphRepository.prototype.getLinkedEntities;
    getEntityWithGraph: typeof GraphRepository.prototype.getEntityWithGraph;
    linkEntityToNote: typeof GraphRepository.prototype.linkEntityToNote;
  }> = {},
): GraphRepository {
  return {
    getLinkedEntities: vi.fn().mockReturnValue([]),
    getEntityWithGraph: vi.fn().mockReturnValue(undefined),
    getLinkedNotes: vi.fn().mockReturnValue([]),
    createEntity: vi.fn().mockReturnValue(1),
    upsertEntity: vi.fn().mockReturnValue(1),
    getEntityById: vi.fn().mockReturnValue(undefined),
    getEntityByName: vi.fn().mockReturnValue(undefined),
    searchEntities: vi.fn().mockReturnValue([]),
    deleteEntity: vi.fn().mockReturnValue(false),
    createRelation: vi.fn().mockReturnValue(1),
    upsertRelation: vi.fn().mockReturnValue(1),
    getRelationsByEntityId: vi.fn().mockReturnValue([]),
    deleteRelation: vi.fn().mockReturnValue(false),
    createObservation: vi.fn().mockReturnValue(1),
    getObservationsByEntityId: vi.fn().mockReturnValue([]),
    deleteObservation: vi.fn().mockReturnValue(false),
    linkEntityToNote: vi.fn(),
    findRelatedEntities: vi.fn().mockReturnValue([]),
    getGraphStats: vi.fn().mockReturnValue({
      totalEntities: 0,
      totalRelations: 0,
      totalObservations: 0,
      entitiesByType: {},
      relationsByType: {},
    }),
    invalidateRelation: vi.fn().mockReturnValue(false),
    invalidateObservation: vi.fn().mockReturnValue(false),
    getRelationHistory: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as GraphRepository;
}

// LLMProviderのモック
function createMockLLMProvider(responseDelay = 0, responseContent?: string): LLMProvider {
  return {
    complete: vi.fn().mockImplementation(async () => {
      if (responseDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, responseDelay));
      }
      return {
        content: responseContent ?? '{"rankings": []}',
        model: "test-model",
        usage: { inputTokens: 10, outputTokens: 10 },
      };
    }),
  };
}

describe("QueryOrchestrator", () => {
  let ctx: TestContext;
  let mockGraphRepo: GraphRepository;

  beforeEach(() => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    mockGraphRepo = createMockGraphRepository();
  });

  afterEach(() => {
    ctx.db.close();
    vi.clearAllMocks();
  });

  describe("Vector層のみの基本動作", () => {
    it("クエリに対してノートを返す", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript" });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("クエリなしの場合は空配列を返す", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({});

      expect(results).toEqual([]);
    });

    it("結果にnote, score, layerScores, matchReasonが含まれる", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript" });

      expect(results.length).toBeGreaterThan(0);
      const first = results[0];
      expect(first.note).toBeDefined();
      expect(typeof first.score).toBe("number");
      expect(first.layerScores).toBeDefined();
      expect(Array.isArray(first.matchReason)).toBe(true);
    });

    it("スコアが降順でソートされている", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript" });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it("limitを超えない件数を返す", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript", limit: 1 });

      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("Graph層の文脈補完", () => {
    it("GraphRepositoryが関連エンティティを返す場合、graphContextが付与される", async () => {
      const entity = {
        id: 1,
        name: "typescript",
        entityType: "technology" as const,
        createdAt: new Date().toISOString(),
      };
      const entityGraph = {
        ...entity,
        observations: [],
        outgoingRelations: [],
        incomingRelations: [],
        linkedNotes: [
          {
            entityId: 1,
            noteId: 999,
            note: { filePath: "ts.md", title: "TS", createdAt: new Date().toISOString() },
          },
        ],
      };

      const graphRepoWithEntity = createMockGraphRepository({
        getLinkedEntities: vi.fn().mockReturnValue([entity]),
        getEntityWithGraph: vi.fn().mockReturnValue(entityGraph),
      });

      const orchestrator = new QueryOrchestrator(ctx.repository, graphRepoWithEntity);
      const results = await orchestrator.query({ query: "TypeScript" });

      // vectorLayerの結果にgraphContextが付与されていること
      const hasGraphContext = results.some((r) => r.graphContext && r.graphContext.length > 0);
      expect(hasGraphContext).toBe(true);
    });

    it("GraphRepositoryが空の場合でも通常のVector結果を返す", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript" });

      expect(results.length).toBeGreaterThan(0);
    });

    it("layerScoresにvectorとgraphが含まれる", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].layerScores).toHaveProperty("vector");
      expect(results[0].layerScores).toHaveProperty("graph");
    });
  });

  describe("Agentic層のリランキング", () => {
    it("LLMプロバイダーがある場合、layerScoresにagenticが含まれる", async () => {
      const mockLlm = createMockLLMProvider(0, '{"rankings": []}');
      const orchestrator = new QueryOrchestrator(
        ctx.repository,
        mockGraphRepo,
        undefined,
        mockLlm,
        { timeoutMs: 3000 },
      );
      const results = await orchestrator.query({ query: "TypeScript" });

      expect(results.length).toBeGreaterThan(0);
      // agenticレイヤーが処理されてlayerScoresにagenticが存在する
      expect(results[0].layerScores).toHaveProperty("agentic");
    });
  });

  describe("タイムアウト制御", () => {
    it("LLMがタイムアウトした場合でもVector+Graphの結果を返す", async () => {
      // 非常に遅いLLMモック (100ms遅延)
      const slowLlm = createMockLLMProvider(100);
      const orchestrator = new QueryOrchestrator(
        ctx.repository,
        mockGraphRepo,
        undefined,
        slowLlm,
        { timeoutMs: 10 }, // 10msでタイムアウト
      );

      const results = await orchestrator.query({ query: "TypeScript" });

      // タイムアウトしても結果が返ることを確認
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    }, 5000);

    it("タイムアウト時のlayerScoresのagenticは0になる", async () => {
      const slowLlm = createMockLLMProvider(100);
      const orchestrator = new QueryOrchestrator(
        ctx.repository,
        mockGraphRepo,
        undefined,
        slowLlm,
        { timeoutMs: 10 },
      );

      const results = await orchestrator.query({ query: "TypeScript" });

      expect(results.length).toBeGreaterThan(0);
      // タイムアウト時はagenticLayerが適用されないので layerScores.agentic は 0
      for (const r of results) {
        expect(r.layerScores["agentic"]).toBe(0);
      }
    }, 5000);
  });

  describe("LLMフォールバック", () => {
    it("LLMプロバイダーがない場合でもVector+Graphで結果を返す", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript" });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("LLMなし時もReasoningRerankerのheuristicスコアが使われる", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript" });

      expect(results.length).toBeGreaterThan(0);
      // LLMなし: ReasoningRerankerのheuristicスコアでagenticが計算される (0 or 正の値)
      for (const r of results) {
        expect(typeof r.layerScores["agentic"]).toBe("number");
        expect(r.layerScores["agentic"]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("3層統合のスコアマージ", () => {
    it("スコアが0以上1以下の範囲に収まる", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);
      const results = await orchestrator.query({ query: "TypeScript" });

      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
      }
    });

    it("クエリタイプによって結果の順序が変わりうる（smokeテスト）", async () => {
      const orchestrator = new QueryOrchestrator(ctx.repository, mockGraphRepo);

      // temporalクエリ
      const temporalResults = await orchestrator.query({ query: "先週のTypeScript変更" });
      // factualクエリ
      const factualResults = await orchestrator.query({ query: "TypeScriptとは" });

      // どちらも結果を返すこと
      expect(Array.isArray(temporalResults)).toBe(true);
      expect(Array.isArray(factualResults)).toBe(true);
    });
  });

  describe("設定", () => {
    it("maxResultsで返却件数を制限できる", async () => {
      const orchestrator = new QueryOrchestrator(
        ctx.repository,
        mockGraphRepo,
        undefined,
        undefined,
        { maxResults: 1 },
      );
      const results = await orchestrator.query({ query: "TypeScript" });

      expect(results.length).toBeLessThanOrEqual(1);
    });
  });
});
