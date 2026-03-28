import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "../../src/index.js";
import { KnowledgeSearcher } from "../../src/search/knowledge-searcher.js";
import type Database from "better-sqlite3";

function createQualityTestDb() {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  return { db, repository };
}

describe("search quality", () => {
  let db: Database.Database;
  let repository: KnowledgeRepository;
  let searcher: KnowledgeSearcher;

  beforeEach(() => {
    ({ db, repository } = createQualityTestDb());
    searcher = new KnowledgeSearcher(repository);
  });

  afterEach(() => {
    db.close();
  });

  describe("unicode61 tokenizer: word-level BM25 matching", () => {
    it("should return word-level matches (not substring noise from trigram)", async () => {
      const now = new Date().toISOString();
      repository.saveNote({
        filePath: "auth-guide.md",
        title: "Authentication Guide",
        content: "How to implement authentication in your application",
        createdAt: now,
      });
      repository.saveNote({
        filePath: "unrelated.md",
        title: "Cooking Recipes",
        content: "How to cook pasta and make delicious food",
        createdAt: now,
      });

      const results = await searcher.search({ query: "authentication" });
      expect(results.length).toBeGreaterThan(0);
      // 関連ノートが上位に来ること
      expect(results[0].note.file_path).toBe("auth-guide.md");
    });

    it("should match full words, not only trigrams", async () => {
      const now = new Date().toISOString();
      repository.saveNote({
        filePath: "typescript-basics.md",
        title: "TypeScript Basics",
        content: "TypeScript is a typed superset of JavaScript",
        createdAt: now,
      });

      // unicode61 はワード単位なので "TypeScript" で検索すれば一致する
      const results = await searcher.search({ query: "TypeScript" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.note.file_path === "typescript-basics.md")).toBe(true);
    });
  });

  describe("BM25 title weight: title match ranks higher than content-only match", () => {
    it("should rank title match higher than content-only match", async () => {
      const now = new Date().toISOString();

      // タイトルに検索語を含むノート（content には含まない）
      repository.saveNote({
        filePath: "react-guide.md",
        title: "React Hooks Guide",
        content: "A comprehensive guide to state management patterns",
        createdAt: now,
      });

      // コンテンツのみに検索語を1回だけ含むノート（タイトルには含まない）
      repository.saveNote({
        filePath: "general-guide.md",
        title: "General Programming Guide",
        content: "You can also use React for building UI components.",
        createdAt: now,
      });

      const results = await searcher.search({ query: "React" });
      expect(results.length).toBeGreaterThanOrEqual(2);

      // title weight 10x により、タイトルに "React" を含む react-guide.md が上位に来るべき
      const titleMatchIndex = results.findIndex((r) => r.note.file_path === "react-guide.md");
      const contentOnlyIndex = results.findIndex((r) => r.note.file_path === "general-guide.md");

      expect(titleMatchIndex).toBeLessThan(contentOnlyIndex);
    });
  });

  describe("CHANGELOG score discount", () => {
    it("should apply discount to CHANGELOG files relative to regular notes", async () => {
      const now = new Date().toISOString();

      // CHANGELOG ファイル（同じ検索語を含む）
      repository.saveNote({
        filePath: "CHANGELOG.md",
        title: "CHANGELOG",
        content: "authentication feature added. authentication improvement. authentication fix.",
        createdAt: now,
      });

      // 通常のドキュメント（タイトルに検索語を含む）
      repository.saveNote({
        filePath: "auth-docs.md",
        title: "Authentication Documentation",
        content: "How to use authentication",
        createdAt: now,
      });

      const results = await searcher.search({ query: "authentication" });
      expect(results.length).toBeGreaterThanOrEqual(2);

      const changelogResult = results.find((r) => r.note.file_path === "CHANGELOG.md");
      const authDocsResult = results.find((r) => r.note.file_path === "auth-docs.md");

      expect(changelogResult).toBeDefined();
      expect(authDocsResult).toBeDefined();

      // CHANGELOG は discount されているので auth-docs.md より順位が下であること
      const changelogIndex = results.findIndex((r) => r.note.file_path === "CHANGELOG.md");
      const authDocsIndex = results.findIndex((r) => r.note.file_path === "auth-docs.md");
      expect(authDocsIndex).toBeLessThan(changelogIndex);
    });

    it("should apply discount to CHANGES.md and HISTORY.md as well", async () => {
      const now = new Date().toISOString();

      repository.saveNote({
        filePath: "CHANGES.md",
        title: "Changes",
        content: "feature added. feature improved. feature updated. feature fixed.",
        createdAt: now,
      });
      repository.saveNote({
        filePath: "HISTORY.txt",
        title: "History",
        content: "feature added. feature improved. feature updated. feature fixed.",
        createdAt: now,
      });
      repository.saveNote({
        filePath: "feature-guide.md",
        title: "Feature Guide",
        content: "How to use this feature",
        createdAt: now,
      });

      const results = await searcher.search({ query: "feature" });
      const changesResult = results.find((r) => r.note.file_path === "CHANGES.md");
      const historyResult = results.find((r) => r.note.file_path === "HISTORY.txt");
      const featureGuideResult = results.find((r) => r.note.file_path === "feature-guide.md");

      if (changesResult && featureGuideResult) {
        // CHANGES.md は discount されるので feature-guide.md より順位が下
        const changesIdx = results.findIndex((r) => r.note.file_path === "CHANGES.md");
        const featureGuideIdx = results.findIndex((r) => r.note.file_path === "feature-guide.md");
        expect(featureGuideIdx).toBeLessThan(changesIdx);
      }
      if (historyResult && featureGuideResult) {
        const historyIdx = results.findIndex((r) => r.note.file_path === "HISTORY.txt");
        const featureGuideIdx2 = results.findIndex((r) => r.note.file_path === "feature-guide.md");
        expect(featureGuideIdx2).toBeLessThan(historyIdx);
      }
    });
  });

  describe("newness bonus: multiplicative", () => {
    it("should give higher score to recently created notes with same keyword relevance", async () => {
      const oldDate = new Date("2020-01-01T00:00:00.000Z").toISOString();
      const recentDate = new Date().toISOString();

      repository.saveNote({
        filePath: "old-guide.md",
        title: "Docker Guide",
        content: "How to use Docker for containerization",
        createdAt: oldDate,
      });
      repository.saveNote({
        filePath: "new-guide.md",
        title: "Docker Guide New",
        content: "How to use Docker for containerization in modern stacks",
        createdAt: recentDate,
      });

      const results = await searcher.search({ query: "Docker" });
      expect(results.length).toBeGreaterThanOrEqual(2);

      const oldResult = results.find((r) => r.note.file_path === "old-guide.md");
      const newResult = results.find((r) => r.note.file_path === "new-guide.md");

      expect(oldResult).toBeDefined();
      expect(newResult).toBeDefined();

      // 新しいノートの方がスコアが高いこと（newnessボーナスが乗算で適用されるため）
      expect(newResult!.score).toBeGreaterThan(oldResult!.score);
    });
  });
});
