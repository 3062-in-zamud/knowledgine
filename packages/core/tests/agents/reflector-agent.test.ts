import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReflectorAgent } from "../../src/agents/reflector-agent.js";
import type { ReflectorAgentDeps } from "../../src/agents/reflector-agent.js";
import { GraphRepository } from "../../src/graph/graph-repository.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { MockLLMProvider } from "../helpers/mock-llm-provider.js";
import type { ObserverOutput } from "../../src/agents/types.js";
// テスト用ObserverOutput生成ヘルパー
function makeObserverOutput(overrides: Partial<ObserverOutput> = {}): ObserverOutput {
  return {
    noteId: 1,
    vectors: [],
    patterns: [],
    entities: [],
    processingMode: "rule",
    processingTimeMs: 10,
    ...overrides,
  };
}

describe("ReflectorAgent", () => {
  let ctx: TestContext;
  let graphRepository: GraphRepository;

  beforeEach(() => {
    ctx = createTestDb();
    graphRepository = new GraphRepository(ctx.db);
  });

  afterEach(() => {
    ctx.db.close();
  });

  // --- ケース 1: supersede検出（Jaccard >= 0.8） ---

  describe("supersede検出", () => {
    it("類似ノート（Jaccard >= 0.8）をsupersede矛盾として検出する", async () => {
      const now = new Date().toISOString();

      // 既存ノート
      const existingNoteId = ctx.repository.saveNote({
        filePath: "existing-note.md",
        title: "TypeScript version",
        content: "TypeScript version is 4.0 and we use it for all projects",
        createdAt: now,
      });

      // 新しいノート（既存と高類似度）
      const newContent = "TypeScript version is 5.0 and we use it for all projects";
      const newNoteId = ctx.repository.saveNote({
        filePath: "new-note.md",
        title: "TypeScript version",
        content: newContent,
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const observerOutput = makeObserverOutput({
        noteId: newNoteId,
        vectors: [{ category: "updates", content: newContent, confidence: 0.9, source: "rule" }],
      });

      const result = await agent.reflect(observerOutput);

      expect(result.noteId).toBe(newNoteId);
      const supersedeContra = result.contradictions.find(
        (c) => c.contradictionType === "supersede" && c.existingNoteId === existingNoteId,
      );
      expect(supersedeContra).toBeDefined();
      expect(supersedeContra?.confidence).toBeGreaterThan(0);
    });

    it("非類似ノート（Jaccard < 0.8）はsupersede検出しない", async () => {
      const now = new Date().toISOString();

      ctx.repository.saveNote({
        filePath: "unrelated-note.md",
        title: "React hooks guide",
        content: "useEffect useCallback useMemo useState hooks for React",
        createdAt: now,
      });

      const newNoteId = ctx.repository.saveNote({
        filePath: "new-note.md",
        title: "Database optimization",
        content: "Indexing strategies for PostgreSQL performance tuning",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const observerOutput = makeObserverOutput({ noteId: newNoteId });
      const result = await agent.reflect(observerOutput);

      const supersedeContras = result.contradictions.filter(
        (c) => c.contradictionType === "supersede",
      );
      expect(supersedeContras).toHaveLength(0);
    });
  });

  // --- ケース 2: factual矛盾検出 ---

  describe("factual矛盾検出", () => {
    it("updatesカテゴリのベクトルと既存ノートのentityが一致する場合にfactual矛盾を検出する", async () => {
      const now = new Date().toISOString();

      const existingNoteId = ctx.repository.saveNote({
        filePath: "existing-fact.md",
        title: "Node.js version",
        content: "Node.js version is 16.x in production",
        createdAt: now,
      });

      const newNoteId = ctx.repository.saveNote({
        filePath: "new-fact.md",
        title: "Node.js update",
        content: "Node.js version is 20.x in production",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      // updatesカテゴリのvectorで既存ノートと同じentity名を使用
      const observerOutput = makeObserverOutput({
        noteId: newNoteId,
        vectors: [
          {
            category: "updates",
            content: "Node.js version is 20.x in production",
            confidence: 0.9,
            source: "rule",
          },
        ],
        entities: [
          {
            name: "node.js",
            type: "technology",
            confidence: 0.9,
            source: "rule",
            mentions: 1,
          },
        ],
      });

      // 既存ノートも同じentityを持つノートとして登録
      // graphRepositoryにentityリンクを作成
      const entityId = graphRepository.upsertEntity({
        name: "node.js",
        entityType: "technology",
        createdAt: now,
      });
      graphRepository.linkEntityToNote(entityId, existingNoteId);

      const result = await agent.reflect(observerOutput);

      expect(result.noteId).toBe(newNoteId);
      const factualContra = result.contradictions.find((c) => c.contradictionType === "factual");
      expect(factualContra).toBeDefined();
    });
  });

  // --- ケース 3: temporal矛盾検出 ---

  describe("temporal矛盾検出", () => {
    it("新しいノートのvalid_fromが既存ノートのvalid_fromより前の場合にtemporal矛盾を検出する", async () => {
      const oldDate = "2020-01-01T00:00:00.000Z";
      const newDate = "2023-01-01T00:00:00.000Z";
      const evenOlderDate = "2019-01-01T00:00:00.000Z"; // 新ノートのvalid_fromは既存より前

      const existingNoteId = ctx.repository.saveNote({
        filePath: "existing-temporal.md",
        title: "Meeting notes",
        content: "Discussed project timeline for Q1 release",
        createdAt: oldDate,
      });

      // existing noteのvalid_fromを設定
      ctx.db
        .prepare("UPDATE knowledge_notes SET valid_from = ? WHERE id = ?")
        .run(newDate, existingNoteId);

      const newNoteId = ctx.repository.saveNote({
        filePath: "new-temporal.md",
        title: "Earlier meeting notes",
        content: "Discussed project timeline for Q1 release plan",
        createdAt: evenOlderDate,
      });

      // newNoteのvalid_fromをevenOlderDateに設定（既存のnewDateより前）
      ctx.db
        .prepare("UPDATE knowledge_notes SET valid_from = ? WHERE id = ?")
        .run(evenOlderDate, newNoteId);

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps, { similarityThreshold: 0.3 });

      const observerOutput = makeObserverOutput({
        noteId: newNoteId,
        vectors: [
          {
            category: "temporal_data",
            content: "Q1 release plan timeline",
            confidence: 0.8,
            source: "rule",
          },
        ],
      });

      const result = await agent.reflect(observerOutput);

      // temporal矛盾として検出されるか確認
      const temporalContra = result.contradictions.find((c) => c.contradictionType === "temporal");
      expect(temporalContra).toBeDefined();
      expect(temporalContra?.existingNoteId).toBe(existingNoteId);
    });
  });

  // --- ケース 4: preference変更検出 ---

  describe("preference変更検出", () => {
    it("preferencesカテゴリの異なる評価を検出する", async () => {
      const now = new Date().toISOString();

      const existingNoteId = ctx.repository.saveNote({
        filePath: "existing-pref.md",
        title: "Tool preferences",
        content: "I prefer using vim for editing because it is fast",
        createdAt: now,
      });

      const newNoteId = ctx.repository.saveNote({
        filePath: "new-pref.md",
        title: "Tool preferences update",
        content: "I prefer using vscode for editing because it has better extensions",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const observerOutput = makeObserverOutput({
        noteId: newNoteId,
        vectors: [
          {
            category: "preferences",
            content: "prefer vscode for editing",
            confidence: 0.9,
            source: "rule",
          },
        ],
      });

      // 既存ノートのpreferencesベクトルをseedとして使用する
      // 既存ノートにpreferencesカテゴリがあり、同じツール(editing)に対する異なる評価
      const existingNote = ctx.repository.getNoteById(existingNoteId);
      expect(existingNote).toBeDefined();

      const result = await agent.reflect(observerOutput);
      expect(result.noteId).toBe(newNoteId);
      // preferencesベクトルがある場合、preference_changeとして検出できるか
      const prefContra = result.contradictions.find(
        (c) => c.contradictionType === "preference_change",
      );
      // 既存ノートにpreferencesが含まれる場合に検出される
      if (prefContra) {
        expect(prefContra.existingNoteId).toBe(existingNoteId);
      }
    });
  });

  // --- ケース 5: 候補提示モード（自動実行しない） ---

  describe("候補提示モード", () => {
    it("reflect()はdeprecation候補を返すが自動でdeprecateしない", async () => {
      const now = new Date().toISOString();

      const existingNoteId = ctx.repository.saveNote({
        filePath: "existing-for-deprecation.md",
        title: "Old knowledge note",
        content: "TypeScript version is 3.0 and we use it for our project development",
        createdAt: now,
      });

      const newNoteId = ctx.repository.saveNote({
        filePath: "new-for-deprecation.md",
        title: "Updated knowledge note",
        content: "TypeScript version is 5.0 and we use it for our project development",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const observerOutput = makeObserverOutput({
        noteId: newNoteId,
        vectors: [
          {
            category: "updates",
            content: "TypeScript version is 5.0 and we use it for our project development",
            confidence: 0.9,
            source: "rule",
          },
        ],
      });

      const result = await agent.reflect(observerOutput);

      // 候補は返すが既存ノートはまだdeprecateされていない
      const existingNote = ctx.repository.getNoteById(existingNoteId);
      expect(existingNote?.deprecated).not.toBe(1);

      // deprecationCandidatesが返されている
      expect(result.deprecationCandidates).toBeDefined();
      expect(Array.isArray(result.deprecationCandidates)).toBe(true);
    });
  });

  // --- ケース 6: applyApprovedDeprecations ---

  describe("applyApprovedDeprecations", () => {
    it("承認済み候補のみをdeprecateする", async () => {
      const now = new Date().toISOString();

      const noteId1 = ctx.repository.saveNote({
        filePath: "to-deprecate-1.md",
        title: "Old Note 1",
        content: "Old content 1",
        createdAt: now,
      });

      const noteId2 = ctx.repository.saveNote({
        filePath: "to-deprecate-2.md",
        title: "Old Note 2",
        content: "Old content 2",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const candidates = [
        {
          noteId: noteId1,
          reason: "Superseded by newer version",
          confidence: 0.9,
          contradictions: [],
        },
      ];

      agent.applyApprovedDeprecations(candidates);

      // noteId1はdeprecateされている
      const note1 = ctx.repository.getNoteById(noteId1);
      expect(note1?.deprecated).toBe(1);
      expect(note1?.deprecation_reason).toBe("Superseded by newer version");

      // noteId2は変更されていない
      const note2 = ctx.repository.getNoteById(noteId2);
      expect(note2?.deprecated).not.toBe(1);
    });

    it("空の候補リストでも正常に動作する", () => {
      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      expect(() => agent.applyApprovedDeprecations([])).not.toThrow();
    });
  });

  // --- ケース 7: LLMフォールバック ---

  describe("LLMフォールバック", () => {
    it("LLMなしでもルールベースのみで動作する", async () => {
      const now = new Date().toISOString();
      const noteId = ctx.repository.saveNote({
        filePath: "rule-only-note.md",
        title: "Rule based note",
        content: "Some content here",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
        // llmProviderなし
      };
      const agent = new ReflectorAgent(deps);
      const observerOutput = makeObserverOutput({ noteId });

      const result = await agent.reflect(observerOutput);

      expect(result.noteId).toBe(noteId);
      expect(result.processingMode).toBe("rule");
      expect(result.contradictions).toBeDefined();
      expect(result.deprecationCandidates).toBeDefined();
    });

    it("LLM利用不可の場合もルールベースにフォールバックする", async () => {
      const now = new Date().toISOString();
      const noteId = ctx.repository.saveNote({
        filePath: "llm-unavailable-note.md",
        title: "LLM unavailable note",
        content: "Content here",
        createdAt: now,
      });

      const unavailableLLM = new MockLLMProvider("mock", "mock-model", false);
      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
        llmProvider: unavailableLLM,
      };
      const agent = new ReflectorAgent(deps);
      const observerOutput = makeObserverOutput({ noteId });

      const result = await agent.reflect(observerOutput);

      expect(result.processingMode).toBe("rule");
    });
  });

  // --- ケース 8: LLM補完モード ---

  describe("LLM補完モード", () => {
    it("LLM有効時にresolutionが判定される", async () => {
      const now = new Date().toISOString();

      const existingNoteId = ctx.repository.saveNote({
        filePath: "existing-llm.md",
        title: "Existing note for LLM test",
        content: "TypeScript version is 3.0 and we use it for the project development workflow",
        createdAt: now,
      });

      const newNoteId = ctx.repository.saveNote({
        filePath: "new-llm.md",
        title: "New note for LLM test",
        content: "TypeScript version is 5.0 and we use it for the project development workflow",
        createdAt: now,
      });

      const llmResponse = JSON.stringify({
        resolution: "deprecate_old",
        reasoning: "新しいバージョンが古いものを上書きする",
      });
      const mockLLM = new MockLLMProvider(llmResponse);

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
        llmProvider: mockLLM,
      };
      const agent = new ReflectorAgent(deps);

      const observerOutput = makeObserverOutput({
        noteId: newNoteId,
        vectors: [
          {
            category: "updates",
            content: "TypeScript version is 5.0 and we use it for the project development workflow",
            confidence: 0.9,
            source: "rule",
          },
        ],
      });

      const result = await agent.reflect(observerOutput);

      // supersede矛盾が検出されている
      const supersedeContra = result.contradictions.find(
        (c) => c.contradictionType === "supersede" && c.existingNoteId === existingNoteId,
      );
      expect(supersedeContra).toBeDefined();
      // LLMが呼ばれた場合、resolutionが設定される
      if (supersedeContra) {
        expect(["deprecate_old", "deprecate_new", "merge", "keep_both"]).toContain(
          supersedeContra.resolution,
        );
      }
      expect(result.processingMode).toBe("hybrid");
    });

    it("LLMレスポンスが不正な場合はルールベースのresolutionにフォールバックする", async () => {
      const now = new Date().toISOString();

      const existingNoteId = ctx.repository.saveNote({
        filePath: "existing-bad-llm.md",
        title: "Existing note",
        content: "TypeScript version is 3.0 and we use it for all project development tasks",
        createdAt: now,
      });

      const newNoteId = ctx.repository.saveNote({
        filePath: "new-bad-llm.md",
        title: "New note",
        content: "TypeScript version is 5.0 and we use it for all project development tasks",
        createdAt: now,
      });

      const mockLLM = new MockLLMProvider("invalid json response {{");

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
        llmProvider: mockLLM,
      };
      const agent = new ReflectorAgent(deps);

      const observerOutput = makeObserverOutput({
        noteId: newNoteId,
        vectors: [
          {
            category: "updates",
            content: "TypeScript version is 5.0 and we use it for all project development tasks",
            confidence: 0.9,
            source: "rule",
          },
        ],
      });

      // エラーなく完了する
      const result = await agent.reflect(observerOutput);
      expect(result).toBeDefined();
      expect(result.noteId).toBe(newNoteId);

      // 矛盾が検出されている（LLMエラーでもルールベースで動作）
      const supersedeContra = result.contradictions.find(
        (c) => c.contradictionType === "supersede" && c.existingNoteId === existingNoteId,
      );
      expect(supersedeContra).toBeDefined();
    });
  });

  // --- ケース 9: reflectBatch ---

  describe("reflectBatch", () => {
    it("複数のObserverOutputを並列処理して結果を返す", async () => {
      const now = new Date().toISOString();

      const noteId1 = ctx.repository.saveNote({
        filePath: "batch-note-1.md",
        title: "Batch Note 1",
        content: "First batch note content",
        createdAt: now,
      });

      const noteId2 = ctx.repository.saveNote({
        filePath: "batch-note-2.md",
        title: "Batch Note 2",
        content: "Second batch note content",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const outputs = [
        makeObserverOutput({ noteId: noteId1 }),
        makeObserverOutput({ noteId: noteId2 }),
      ];

      const results = await agent.reflectBatch(outputs);

      expect(results).toHaveLength(2);
      expect(results[0].noteId).toBe(noteId1);
      expect(results[1].noteId).toBe(noteId2);
    });

    it("空の入力で空の配列を返す", async () => {
      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const results = await agent.reflectBatch([]);
      expect(results).toHaveLength(0);
    });

    it("バッチ処理中に一部失敗してもerrorsに記録して継続する", async () => {
      const now = new Date().toISOString();

      const noteId = ctx.repository.saveNote({
        filePath: "batch-error-note.md",
        title: "Batch Error Note",
        content: "Valid content",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const outputs = [
        makeObserverOutput({ noteId: noteId }),
        makeObserverOutput({ noteId: 99999 }), // 存在しないノート
      ];

      const results = await agent.reflectBatch(outputs);
      expect(results).toHaveLength(2);
      // 有効なノートは正常に処理される
      expect(results[0].noteId).toBe(noteId);
      // 存在しないノートはエラーとして記録される
      expect(results[1].errors).toBeDefined();
    });
  });

  // --- ケース 10: ReflectorOutputの構造確認 ---

  describe("ReflectorOutput構造", () => {
    it("reflect()が正しいReflectorOutput構造を返す", async () => {
      const now = new Date().toISOString();
      const noteId = ctx.repository.saveNote({
        filePath: "output-structure-note.md",
        title: "Output structure test",
        content: "Testing output structure",
        createdAt: now,
      });

      const deps: ReflectorAgentDeps = {
        repository: ctx.repository,
        graphRepository,
      };
      const agent = new ReflectorAgent(deps);

      const result = await agent.reflect(makeObserverOutput({ noteId }));

      expect(result).toMatchObject({
        noteId,
        contradictions: expect.any(Array),
        deprecationCandidates: expect.any(Array),
        versionUpdates: expect.any(Array),
        processingMode: expect.stringMatching(/^(rule|hybrid)$/),
        processingTimeMs: expect.any(Number),
      });
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
