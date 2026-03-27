import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  KnowledgeSearcher,
  MemoryManager,
} from "@knowledgine/core";

describe("CLI E2E: init → extract → search", () => {
  let testDir: string;
  const monorepoRoot = resolve(__dirname, "../../../../");
  const cliDist = resolve(__dirname, "../../dist/index.js");

  beforeAll(() => {
    // Ensure CLI is built
    if (!existsSync(cliDist)) {
      execFileSync("pnpm", ["run", "build"], { cwd: monorepoRoot, stdio: "inherit" });
    }

    testDir = mkdtempSync(join(tmpdir(), "knowledgine-e2e-"));

    // Create subdirectories
    for (const dir of ["daily", "tickets", "notes", "retrospective"]) {
      mkdirSync(join(testDir, dir), { recursive: true });
    }

    // Create 10 sample markdown files that match DEFAULT_PATTERNS
    // daily/2024-01-15.md - daily/2024-01-17.md with ## 問題 / ## 解決 / ## 学び + time patterns
    writeFileSync(
      join(testDir, "daily/2024-01-15.md"),
      `---
tags:
  - daily
  - typescript
---
# 2024-01-15 日報

## 問題
TypeScriptのビルドが失敗する。エラーメッセージが不明瞭で3時間かかった。

## 解決
tsconfig.jsonのpathsを修正して解決した。

## 学び
学んだこと: TypeScriptのパス解決は相対パスとエイリアスで挙動が異なる。
`,
    );

    writeFileSync(
      join(testDir, "daily/2024-01-16.md"),
      `---
tags:
  - daily
  - react
---
# 2024-01-16 日報

## 問題
Reactコンポーネントのレンダリングが遅い。30分のデバッグ。

## 解決
useMemoを使用してパフォーマンスを改善した。

## 学び
学んだこと: 不要な再レンダリングを防ぐにはメモ化が有効。
`,
    );

    writeFileSync(
      join(testDir, "daily/2024-01-17.md"),
      `---
tags:
  - daily
  - testing
---
# 2024-01-17 日報

## 問題
テストカバレッジが低い。2時間の調査。

## 解決
vitestの設定を見直して改善した。

## 学び
学んだこと: v8 coverageプロバイダーが最も正確。
`,
    );

    // tickets/PROJ-101.md, tickets/PROJ-102.md with frontmatter tags + time estimates
    writeFileSync(
      join(testDir, "tickets/PROJ-101.md"),
      `---
tags:
  - typescript
  - refactoring
---
# PROJ-101: TypeScript型定義の改善

## 問題定義
既存の型定義が不正確で、ランタイムエラーが発生している。

## 実装結果
完了: strict modeを有効化し、全ての型エラーを修正。

見積: 8時間
実績: 6時間
`,
    );

    writeFileSync(
      join(testDir, "tickets/PROJ-102.md"),
      `---
tags:
  - testing
  - ci
---
# PROJ-102: CI パイプライン改善

## 問題定義
CIが遅すぎて開発効率が低下している。

## Resolution
Implemented parallel test execution and caching.

見積: 5時間
実績: 4時間
`,
    );

    // notes/typescript-tips.md ~ notes/testing-strategy.md with inline patterns
    writeFileSync(
      join(testDir, "notes/typescript-tips.md"),
      `# TypeScript Tips

エラー: 型推論が期待通りに動作しない場合がある。
Solution: 明示的な型アノテーションを使用する。
学んだこと: TypeScriptの型推論は文脈に依存する。
`,
    );

    writeFileSync(
      join(testDir, "notes/testing-strategy.md"),
      `# テスト戦略

エラー: E2Eテストが不安定で失敗する。
Solution: テストの分離とクリーンアップを徹底する。
学んだこと: テストは独立して実行可能であるべき。
`,
    );

    writeFileSync(
      join(testDir, "notes/react-patterns.md"),
      `# React Design Patterns

エラー: プロップドリリングが深くなりすぎている。
Solution: Context APIまたはZustandを使用する。
学んだこと: 状態管理は適切な粒度で設計すべき。
`,
    );

    // retrospective/sprint-1.md, sprint-2.md with classificationRules matches
    writeFileSync(
      join(testDir, "retrospective/sprint-1.md"),
      `# Sprint 1 振り返り

同じエラーが繰り返し発生した。ビルド設定の問題。
修正完了: webpack設定を見直して問題を解決。
`,
    );

    writeFileSync(
      join(testDir, "retrospective/sprint-2.md"),
      `# Sprint 2 振り返り

同じエラーagainで再度発生。テスト環境の不整合。
solved: テスト環境をDockerで統一して修正完了。
`,
    );
  }, 60_000);

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should run init command successfully", () => {
    execFileSync("node", [cliDist, "init", "--path", testDir, "--skip-embeddings"], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    // init outputs to stderr, so just verify no exception thrown
    expect(true).toBe(true);
  });

  it("should create .knowledgine/index.sqlite", () => {
    expect(existsSync(join(testDir, ".knowledgine", "index.sqlite"))).toBe(true);
  });

  it("should index all 10 markdown files", () => {
    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    expect(stats.totalNotes).toBe(10);
    db.close();
  });

  it("should extract patterns from indexed files", () => {
    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    expect(stats.totalPatterns).toBeGreaterThan(0);
    db.close();
  });

  it("should find notes via FTS search", async () => {
    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const searcher = new KnowledgeSearcher(repository);
    const results = await searcher.search({ query: "TypeScript" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Check that result note content mentions TypeScript
    const hasTypeScript = results.some(
      (r) => r.note.content.includes("TypeScript") || r.note.title.includes("TypeScript"),
    );
    expect(hasTypeScript).toBe(true);
    db.close();
  });

  it("should support memory manager operations", () => {
    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const memoryManager = new MemoryManager(db);

    // Store a memory entry linked to a note
    const note = repository.getNoteByPath("notes/typescript-tips.md");
    expect(note).toBeDefined();

    memoryManager.store("episodic", "テスト記憶内容", note!.id);
    const context = memoryManager.getContext(note!.id);
    expect(context.episodic.length).toBeGreaterThanOrEqual(1);

    db.close();
  });
});
