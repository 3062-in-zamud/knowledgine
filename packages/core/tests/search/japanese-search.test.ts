import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "../../src/index.js";
import { KnowledgeSearcher } from "../../src/search/knowledge-searcher.js";
import type Database from "better-sqlite3";

describe("Japanese search (KNOW-366)", () => {
  let db: Database.Database;
  let repository: KnowledgeRepository;
  let searcher: KnowledgeSearcher;

  beforeEach(() => {
    db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    repository = new KnowledgeRepository(db);
    searcher = new KnowledgeSearcher(repository);

    const now = new Date().toISOString();
    repository.saveNote({
      filePath: "auth-ja.md",
      title: "認証システムの設計",
      content: "ユーザー認証とセッション管理の実装ガイド",
      createdAt: now,
    });
    repository.saveNote({
      filePath: "db-ja.md",
      title: "データベース移行手順",
      content: "PostgreSQLからMySQLへのデータベース移行",
      createdAt: now,
    });
    repository.saveNote({
      filePath: "docker-mixed.md",
      title: "Docker設定ガイド",
      content: "Docker compose configuration for development environment",
      createdAt: now,
    });
    repository.saveNote({
      filePath: "auth-en.md",
      title: "Authentication Guide",
      content: "How to implement authentication in your application",
      createdAt: now,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("should find results for Japanese-only query", async () => {
    const results = await searcher.search({ query: "認証" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.note.file_path === "auth-ja.md")).toBe(true);
  });

  it("should find results for Japanese partial match via trigram", async () => {
    const results = await searcher.search({ query: "データベース" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.note.file_path === "db-ja.md")).toBe(true);
  });

  it("should find results for mixed Japanese-English query", async () => {
    const results = await searcher.search({ query: "Docker設定" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.note.file_path === "docker-mixed.md")).toBe(true);
  });

  it("should still use unicode61 for English-only queries (BM25 quality)", async () => {
    const results = await searcher.search({ query: "authentication" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].note.file_path).toBe("auth-en.md");
  });

  it("should not return zero results for Japanese commit-style messages", async () => {
    const now = new Date().toISOString();
    repository.saveNote({
      filePath: "commit-ja.md",
      title: "バグ修正: ログイン画面",
      content: "ログイン画面のバリデーションエラーを修正",
      createdAt: now,
    });

    const results = await searcher.search({ query: "バグ修正" });
    expect(results.length).toBeGreaterThan(0);
  });

  it("KNOW-393: should find compound Japanese noun phrases via trigram (推論エンジンの最適化)", async () => {
    const now = new Date().toISOString();
    repository.saveNote({
      filePath: "inference-engine.md",
      title: "推論エンジンの最適化",
      content: "推論エンジンの最適化により、レスポンス速度が30%向上した",
      createdAt: now,
    });

    // Compound query should match via trigram — FTS5 boolean syntax must NOT be applied
    const results = await searcher.search({ query: "推論エンジンの最適化" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.note.file_path === "inference-engine.md")).toBe(true);
  });

  it("KNOW-393: should not throw on CJK query with OR-like content in trigram path", async () => {
    const now = new Date().toISOString();
    repository.saveNote({
      filePath: "search-or.md",
      title: "検索機能の改善",
      content: "全文検索とセマンティック検索を組み合わせた改善",
      createdAt: now,
    });

    // Query containing CJK should use trigram table without FTS5 boolean syntax
    await expect(searcher.search({ query: "検索機能" })).resolves.toBeDefined();
  });
});
