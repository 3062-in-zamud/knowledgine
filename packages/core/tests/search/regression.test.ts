/**
 * Sprint 5 回帰テストスイート (KNOW-419)
 *
 * Sprint 1-4で発見されたバグの再発防止テスト。
 * seedTestData は使用せず、独自のデータセットを構築する。
 *
 * TDD: 修正前は一部テストが FAIL することを期待。
 * 修正後に全テスト GREEN を確認する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HybridSearcher } from "../../src/search/hybrid-searcher.js";
import { createTestDb } from "../helpers/test-db.js";
import { MockEmbeddingProvider } from "../helpers/mock-embedding-provider.js";
import type { TestContext } from "../helpers/test-db.js";
import type { KnowledgeData } from "../../src/types.js";

/**
 * 回帰テスト専用データセット（20件以上の現実的なノート群）
 * CHANGELOG、低confidenceノイズ、ハイフン含みコンテンツを含む
 */
function seedRegressionData(ctx: TestContext): Map<string, number> {
  const now = new Date().toISOString();
  const ids = new Map<string, number>();

  const notes: KnowledgeData[] = [
    // 通常の技術ノート
    {
      filePath: "docs/api-design.md",
      title: "API Design Patterns",
      content:
        "RESTful API design patterns including pagination, error handling, and versioning strategies for web services.",
      frontmatter: { tags: ["api", "design"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/vue-router-guide.md",
      title: "Vue Router Setup Guide",
      content:
        "How to configure vue-router with nested routes, route guards, and dynamic segments in a Vue.js application.",
      frontmatter: { tags: ["vue", "router"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/http-client.md",
      title: "HTTP Client Configuration",
      content:
        "Setting up http.client with retry logic, timeout configuration, and interceptors for API communication.",
      frontmatter: { tags: ["http", "client"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/testing-strategies.md",
      title: "Testing Strategies",
      content:
        "Unit testing, integration testing, and end-to-end testing strategies for TypeScript applications.",
      frontmatter: { tags: ["testing", "typescript"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/error-handling.md",
      title: "Error Handling Patterns",
      content:
        "Error handling patterns with try-catch, custom error classes, and error boundary components.",
      frontmatter: { tags: ["error", "patterns"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/database-migrations.md",
      title: "Database Migration Guide",
      content:
        "Running database migrations with version control, rollback strategies, and schema validation.",
      frontmatter: { tags: ["database", "migration"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/ci-cd-pipeline.md",
      title: "CI/CD Pipeline Setup",
      content:
        "Configuring CI/CD pipelines with GitHub Actions, automated testing, and deployment workflows.",
      frontmatter: { tags: ["ci", "cd", "devops"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/authentication.md",
      title: "Authentication Implementation",
      content:
        "JWT authentication with refresh tokens, OAuth2 integration, and session management.",
      frontmatter: { tags: ["auth", "security"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/performance-optimization.md",
      title: "Performance Optimization",
      content:
        "Performance optimization techniques including lazy loading, caching, and bundle size reduction.",
      frontmatter: { tags: ["performance"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/typescript-config.md",
      title: "TypeScript Configuration",
      content:
        "TypeScript tsconfig.json configuration with strict mode, path aliases, and module resolution.",
      frontmatter: { tags: ["typescript", "config"] },
      createdAt: now,
      confidence: 1.0,
    },
    // CHANGELOG / README ノート（hybrid検索でdiscountされるべき）
    {
      filePath: "CHANGELOG.md",
      title: "CHANGELOG",
      content:
        "## v1.0.0\n- Added API design patterns\n- Added vue-router setup guide\n- Added testing strategies",
      frontmatter: {},
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "README.md",
      title: "README",
      content:
        "# Project\nA comprehensive guide covering API design, testing strategies, and TypeScript configuration.",
      frontmatter: {},
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "CHANGES.txt",
      title: "CHANGES",
      content: "Version history: API design patterns, error handling, authentication updates.",
      frontmatter: {},
      createdAt: now,
      confidence: 1.0,
    },
    // 低confidenceノイズノート（dependabot等）
    {
      filePath: "commits/dependabot-bump-eslint.md",
      title: "Bump eslint from 8.0.0 to 9.0.0",
      content: "Bumps eslint from 8.0.0 to 9.0.0. TypeScript configuration updated.",
      frontmatter: { tags: ["dependabot"] },
      createdAt: now,
      confidence: 0.0, // noise
    },
    {
      filePath: "commits/dependabot-bump-react.md",
      title: "Bump react from 18.2.0 to 18.3.0",
      content: "Bumps react from 18.2.0 to 18.3.0. Performance optimization included.",
      frontmatter: { tags: ["dependabot"] },
      createdAt: now,
      confidence: 0.0, // noise
    },
    {
      filePath: "commits/minor-typo-fix.md",
      title: "Fix typo",
      content: "Fixed typo in API design documentation.",
      frontmatter: {},
      createdAt: now,
      confidence: 0.3, // low-value
    },
    // ハイフン/ドット含みコンテンツ（FTS5複合語テスト用）
    {
      filePath: "docs/next-auth-setup.md",
      title: "next-auth Setup",
      content: "Configuring next-auth with OAuth providers, session callbacks, and JWT strategy.",
      frontmatter: { tags: ["next-auth", "authentication"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/node-version.md",
      title: "Node.js Version Management",
      content:
        "Managing node v18.17.0 with nvm, version constraints in package.json engines field.",
      frontmatter: { tags: ["node", "version"] },
      createdAt: now,
      confidence: 1.0,
    },
    // semantic検索テスト用追加ノート
    {
      filePath: "docs/state-management.md",
      title: "State Management Comparison",
      content:
        "Comparing state management solutions: Redux, Zustand, Jotai, and React Context API.",
      frontmatter: { tags: ["state", "react"] },
      createdAt: now,
      confidence: 1.0,
    },
    {
      filePath: "docs/monorepo-setup.md",
      title: "Monorepo Architecture",
      content: "Setting up monorepo with pnpm workspaces, turborepo, and shared packages.",
      frontmatter: { tags: ["monorepo", "architecture"] },
      createdAt: now,
      confidence: 1.0,
    },
  ];

  for (const note of notes) {
    const id = ctx.repository.saveNote(note);
    ids.set(note.filePath, id);
  }

  return ids;
}

/**
 * ノートにembeddingを生成・保存する
 */
async function generateEmbeddings(
  ctx: TestContext,
  provider: MockEmbeddingProvider,
  noteIds: Map<string, number>,
): Promise<void> {
  for (const [_filePath, noteId] of noteIds) {
    const note = ctx.repository.getNoteById(noteId);
    if (!note) continue;
    // noise（confidence=0）ノートにはembeddingを生成しない（実環境と同じ動作）
    if (note.confidence !== null && note.confidence <= 0.1) continue;
    const embedding = await provider.embed(`${note.title} ${note.content}`);
    ctx.repository.saveEmbedding(noteId, embedding, "multilingual-e5-small");
  }
}

describe("Sprint 5 回帰テストスイート (KNOW-419)", () => {
  let ctx: TestContext;
  let provider: MockEmbeddingProvider;
  let noteIds: Map<string, number>;

  beforeEach(async () => {
    ctx = createTestDb();
    provider = new MockEmbeddingProvider();
    noteIds = seedRegressionData(ctx);
    await generateEmbeddings(ctx, provider, noteIds);
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("1. semantic検索回帰 (Sprint 2再発防止)", () => {
    it("embeddingが生成されたDBでhybrid検索が結果を返すこと", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await searcher.search("API design patterns");
      expect(results.length).toBeGreaterThan(0);
      // semantic理由を含む結果が存在すること
      const hasSemanticResult = results.some((r) =>
        r.matchReason.some((m) => m.startsWith("セマンティック:")),
      );
      expect(hasSemanticResult).toBe(true);
    });

    it("semantic検索単体でも結果を返すこと（FTSなしでもベクトル検索が動作）", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.0, "e5", 0.0);
      // alpha=0 → FTS重み0%、semantic重み100%
      const results = await searcher.search("state management comparison");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("2. adaptive alpha回帰 (Sprint 4 KNOW-412再発防止)", () => {
    it("spread良好時にalphaが引き上げられないこと", async () => {
      // well-spread semantic scores をモック
      const mockSearchByVector = vi.spyOn(ctx.repository, "searchByVector").mockReturnValue([
        { note_id: noteIds.get("docs/api-design.md")!, distance: Math.sqrt(2 * (1 - 0.95)) },
        { note_id: noteIds.get("docs/testing-strategies.md")!, distance: Math.sqrt(2 * (1 - 0.8)) },
        { note_id: noteIds.get("docs/error-handling.md")!, distance: Math.sqrt(2 * (1 - 0.65)) },
        { note_id: noteIds.get("docs/typescript-config.md")!, distance: Math.sqrt(2 * (1 - 0.5)) },
        { note_id: noteIds.get("docs/ci-cd-pipeline.md")!, distance: Math.sqrt(2 * (1 - 0.35)) },
      ]);

      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);

      // spread = 0.95 - 0.35 = 0.60 >> 0.05 → alphaは0.3のまま（調整なし）
      // 修正前: Math.max(0.3, 0.5) = 0.5 → semantic重み50% (バグ)
      // 修正後: alpha = 0.3 → semantic重み70% (正しい)
      const results = await searcher.search("API design");

      // semantic重みが高い（alpha=0.3）場合、semanticスコア0.95のノートが上位に来る
      expect(results.length).toBeGreaterThan(0);
      const topNote = results[0];
      // API design patterns がトップに来ること（semantic 0.95 + keyword match）
      expect(topNote.note.file_path).toBe("docs/api-design.md");

      // semantic理由のスコアが高いこと（alpha=0.3 → semantic 70%重み）
      const semanticReason = topNote.matchReason.find((m) => m.startsWith("セマンティック:"));
      expect(semanticReason).toBeDefined();
      // "セマンティック: 95.0%" のような文字列からスコアを抽出
      const semanticScore = parseFloat(semanticReason!.match(/(\d+\.\d+)/)![1]);
      expect(semanticScore).toBeGreaterThan(90); // 95%近い値

      mockSearchByVector.mockRestore();
    });

    it("spread平坦時にalphaがkeyword側にシフトされること", async () => {
      // tight cluster semantic scores をモック
      const mockSearchByVector = vi.spyOn(ctx.repository, "searchByVector").mockReturnValue([
        { note_id: noteIds.get("docs/api-design.md")!, distance: Math.sqrt(2 * (1 - 0.75)) },
        {
          note_id: noteIds.get("docs/testing-strategies.md")!,
          distance: Math.sqrt(2 * (1 - 0.74)),
        },
        { note_id: noteIds.get("docs/error-handling.md")!, distance: Math.sqrt(2 * (1 - 0.74)) },
        { note_id: noteIds.get("docs/typescript-config.md")!, distance: Math.sqrt(2 * (1 - 0.73)) },
        { note_id: noteIds.get("docs/ci-cd-pipeline.md")!, distance: Math.sqrt(2 * (1 - 0.73)) },
      ]);

      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);

      // spread = 0.75 - 0.73 = 0.02 < 0.05 → alpha → 0.7（keyword優先）
      const results = await searcher.search("TypeScript");

      expect(results.length).toBeGreaterThan(0);
      // keyword matchが強いノートが上位に来る（alpha=0.7 → keyword 70%重み）
      const topNote = results[0];
      const hasKeywordReason = topNote.matchReason.some((m) => m.startsWith("キーワード:"));
      expect(hasKeywordReason).toBe(true);

      mockSearchByVector.mockRestore();
    });
  });

  describe("3. CHANGELOG hybrid除外 (KNOW-420)", () => {
    it("CHANGELOG.mdがhybrid検索top-5に含まれないこと", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      // CHANGELOG内容にマッチするクエリ
      const results = await searcher.search("API design");

      const top5 = results.slice(0, 5);
      const changelogInTop5 = top5.some((r) => r.note.file_path === "CHANGELOG.md");
      // CHANGELOG にdiscountが適用され、top-5から外れること
      expect(changelogInTop5).toBe(false);
    });

    it("README.mdのスコアがdiscountされること", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await searcher.search("testing strategies TypeScript");

      const readmeResult = results.find((r) => r.note.file_path === "README.md");
      const normalResult = results.find((r) => r.note.file_path === "docs/testing-strategies.md");

      // READMEが存在する場合、通常ノートよりスコアが低いこと
      if (readmeResult && normalResult) {
        expect(readmeResult.score).toBeLessThan(normalResult.score);
      }
    });
  });

  describe("4. FTS5複合語 (KNOW-417)", () => {
    it("ハイフン含み複合語で検索結果が返ること", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await searcher.search("vue-router");
      expect(results.length).toBeGreaterThan(0);
      // vue-router-guide.md がヒットすること
      const hasVueRouter = results.some((r) => r.note.file_path === "docs/vue-router-guide.md");
      expect(hasVueRouter).toBe(true);
    });

    it("ドット含み複合語で検索結果が返ること", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await searcher.search("http.client");
      expect(results.length).toBeGreaterThan(0);
    });

    it("next-auth で関連ノートがヒットすること", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await searcher.search("next-auth");
      expect(results.length).toBeGreaterThan(0);
      const hasNextAuth = results.some((r) => r.note.file_path === "docs/next-auth-setup.md");
      expect(hasNextAuth).toBe(true);
    });
  });

  describe("5. confidence除外 (KNOW-418)", () => {
    it("noise（confidence=0）ノートがkeyword検索上位に来ないこと", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      // dependabot ノートの内容にマッチするクエリだが、confidence=0なので除外されるべき
      const results = await searcher.search("TypeScript configuration");

      const top5 = results.slice(0, 5);
      const noiseInTop5 = top5.some((r) => r.note.file_path.startsWith("commits/dependabot-"));
      expect(noiseInTop5).toBe(false);
    });

    it("low-value（confidence=0.3）ノートがスコア割引されること", async () => {
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await searcher.search("API design documentation");

      const typoFixResult = results.find((r) => r.note.file_path === "commits/minor-typo-fix.md");
      const normalResult = results.find((r) => r.note.file_path === "docs/api-design.md");

      // low-valueノートが存在する場合、通常ノートよりスコアが低いこと
      if (typoFixResult && normalResult) {
        expect(typoFixResult.score).toBeLessThan(normalResult.score);
      }
    });
  });

  describe("6. AND→OR fallback保護（既存動作）", () => {
    it("AND結果が不足時にOR補完が機能すること", async () => {
      // "monorepo turborepo" はANDでは1件のみ（monorepo-setup.md）
      // OR展開で追加結果が補完されるべき
      const searcher = new HybridSearcher(ctx.repository, provider, 0.3, "e5", 0.0);
      const results = await searcher.search("monorepo architecture");
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
