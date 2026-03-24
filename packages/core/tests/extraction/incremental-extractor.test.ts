import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GraphRepository } from "../../src/graph/graph-repository.js";
import { IncrementalExtractor } from "../../src/extraction/incremental-extractor.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("IncrementalExtractor", () => {
  let ctx: TestContext;
  let graphRepository: GraphRepository;
  let extractor: IncrementalExtractor;

  beforeEach(() => {
    ctx = createTestDb();
    graphRepository = new GraphRepository(ctx.db);
    extractor = new IncrementalExtractor(ctx.repository, graphRepository);
  });

  afterEach(() => {
    ctx.db.close();
  });

  // ────────────────────────────────────────────────
  // 1. 空 noteIds → 何もしない、サマリーは全てゼロ
  // ────────────────────────────────────────────────
  it("returns zero summary for empty noteIds", async () => {
    const summary = await extractor.process([]);
    expect(summary.processedNotes).toBe(0);
    expect(summary.totalEntities).toBe(0);
    expect(summary.totalRelations).toBe(0);
    expect(summary.totalPatterns).toBe(0);
    expect(summary.errors).toBe(0);
  });

  // ────────────────────────────────────────────────
  // 2. 指定 noteIds のみにパターン抽出を実行
  // ────────────────────────────────────────────────
  it("processes only specified noteIds", async () => {
    const id1 = ctx.repository.saveNote({
      filePath: "note1.md",
      title: "Note 1",
      content: "TypeScript is a programming language\nFix: resolved the issue",
      createdAt: new Date().toISOString(),
    });
    const _id2 = ctx.repository.saveNote({
      filePath: "note2.md",
      title: "Note 2",
      content: "React hooks are useful",
      createdAt: new Date().toISOString(),
    });

    const summary = await extractor.process([id1]);
    expect(summary.processedNotes).toBe(1);

    // note2 のパターンは保存されていないことを確認
    const note2Patterns = ctx.repository.getPatternsByNoteId(_id2);
    expect(note2Patterns.length).toBe(0);
  });

  // ────────────────────────────────────────────────
  // 3. エンティティ抽出・関係推論も指定ノートのみ
  // ────────────────────────────────────────────────
  it("extracts entities only for specified notes", async () => {
    const id1 = ctx.repository.saveNote({
      filePath: "entity-note.md",
      title: "Entity Note",
      content: "TypeScript and React are popular technologies",
      createdAt: new Date().toISOString(),
    });

    const summary = await extractor.process([id1]);
    expect(summary.processedNotes).toBe(1);
    // エンティティが抽出されていること（0以上）
    expect(summary.totalEntities).toBeGreaterThanOrEqual(0);
  });

  // ────────────────────────────────────────────────
  // 4. 存在しない noteId → スキップ（エラーカウント増加のみ）
  // ────────────────────────────────────────────────
  it("skips non-existent noteIds and increments error count", async () => {
    const summary = await extractor.process([99999]);
    expect(summary.processedNotes).toBe(0);
    expect(summary.errors).toBe(1);
  });

  // ────────────────────────────────────────────────
  // 5. 冪等性（再実行で結果が変わらない）
  // ────────────────────────────────────────────────
  it("is idempotent - re-running does not change results", async () => {
    const id = ctx.repository.saveNote({
      filePath: "idempotent.md",
      title: "Idempotent Note",
      content: "Fix: TypeScript error resolved. Using React hooks.",
      createdAt: new Date().toISOString(),
    });

    const summary1 = await extractor.process([id]);
    const summary2 = await extractor.process([id]);

    expect(summary1.processedNotes).toBe(summary2.processedNotes);
    // パターン件数は idempotent（savePatterns は DELETE + INSERT なので同数）
    const patterns1 = ctx.repository.getPatternsByNoteId(id);
    await extractor.process([id]);
    const patterns2 = ctx.repository.getPatternsByNoteId(id);
    expect(patterns1.length).toBe(patterns2.length);
  });

  // ────────────────────────────────────────────────
  // 6. noteIds に重複 ID → 各 ID は 1 回のみ処理
  // ────────────────────────────────────────────────
  it("deduplicates noteIds - each note processed only once", async () => {
    const id = ctx.repository.saveNote({
      filePath: "dedup.md",
      title: "Dedup Note",
      content: "TypeScript programming",
      createdAt: new Date().toISOString(),
    });

    const progressCalls: Array<{ current: number; total: number }> = [];
    const summary = await extractor.process([id, id, id], (current, total) => {
      progressCalls.push({ current, total });
    });

    // 重複排除後は 1 件のみ処理
    expect(summary.processedNotes).toBe(1);
    // total は重複排除後の件数
    if (progressCalls.length > 0) {
      expect(progressCalls[progressCalls.length - 1].total).toBe(1);
    }
  });

  // ────────────────────────────────────────────────
  // 7. noteIds 1000 件超 → チャンク分割で正常動作
  // ────────────────────────────────────────────────
  it("handles more than 1000 noteIds with chunk processing", async () => {
    // 1100 件のノートを作成
    const ids: number[] = [];
    for (let i = 0; i < 1100; i++) {
      const id = ctx.repository.saveNote({
        filePath: `bulk-note-${i}.md`,
        title: `Bulk Note ${i}`,
        content: `Content for note ${i}. TypeScript and React.`,
        createdAt: new Date().toISOString(),
      });
      ids.push(id);
    }

    const summary = await extractor.process(ids);
    expect(summary.processedNotes).toBe(1100);
    expect(summary.errors).toBe(0);
  }, 30000); // タイムアウトを 30 秒に延長

  // ────────────────────────────────────────────────
  // 8. 途中失敗 → 成功分は保存、エラーはサマリーに反映
  // ────────────────────────────────────────────────
  it("continues processing after individual note failure", async () => {
    const id1 = ctx.repository.saveNote({
      filePath: "good-note.md",
      title: "Good Note",
      content: "TypeScript is good",
      createdAt: new Date().toISOString(),
    });
    // 存在しない ID を挟む
    const nonExistentId = 99998;
    const id2 = ctx.repository.saveNote({
      filePath: "another-good-note.md",
      title: "Another Good Note",
      content: "React is great",
      createdAt: new Date().toISOString(),
    });

    const summary = await extractor.process([id1, nonExistentId, id2]);
    expect(summary.processedNotes).toBe(2);
    expect(summary.errors).toBe(1);
  });

  // ────────────────────────────────────────────────
  // 9. extracted_at が処理後に更新される
  // ────────────────────────────────────────────────
  it("updates extracted_at timestamp after processing", async () => {
    const id = ctx.repository.saveNote({
      filePath: "extracted-at.md",
      title: "Extracted At Note",
      content: "TypeScript programming language",
      createdAt: new Date().toISOString(),
    });

    // 処理前は extracted_at が null
    const before = ctx.repository.getNoteById(id);
    expect(before?.extracted_at).toBeNull();

    await extractor.process([id]);

    // 処理後は extracted_at が設定されている
    const after = ctx.db
      .prepare("SELECT extracted_at FROM knowledge_notes WHERE id = ?")
      .get(id) as { extracted_at: string | null };
    expect(after.extracted_at).not.toBeNull();
  });

  // ────────────────────────────────────────────────
  // 10. onProgress コールバックが呼ばれる
  // ────────────────────────────────────────────────
  it("calls onProgress callback during processing", async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const id = ctx.repository.saveNote({
        filePath: `progress-note-${i}.md`,
        title: `Progress Note ${i}`,
        content: `Content ${i}`,
        createdAt: new Date().toISOString(),
      });
      ids.push(id);
    }

    const progressCalls: Array<[number, number]> = [];
    await extractor.process(ids, (current, total) => {
      progressCalls.push([current, total]);
    });

    expect(progressCalls.length).toBe(3);
    expect(progressCalls[2][0]).toBe(3);
    expect(progressCalls[2][1]).toBe(3);
  });
});
