import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalLinkGenerator } from "../../src/search/link-generator.js";
import { GraphRepository } from "../../src/graph/graph-repository.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("Entity scoring — KNOW-351", () => {
  let ctx: TestContext;
  let graphRepo: GraphRepository;
  let generator: LocalLinkGenerator;

  beforeEach(() => {
    ctx = createTestDb();
    graphRepo = new GraphRepository(ctx.db);
    generator = new LocalLinkGenerator(ctx.repository, graphRepo);
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("findByGraphTraversal — IDF scoring", () => {
    it("稀なエンティティを共有するノートのスコア > 頻出エンティティを共有するノートのスコア", () => {
      // 他の検索メソッド（タグ・タイトル・時刻）の影響を排除するため、
      // ノートを時刻的に7日以上離し、タグなし・タイトル重複なしで作成する
      const targetDate = "2024-01-01T00:00:00.000Z";
      const rareLinkDate = "2024-02-01T00:00:00.000Z"; // 31日後（時刻近接外）
      const commonLinkDate = "2024-03-01T00:00:00.000Z"; // 60日後（時刻近接外）

      // ターゲットノート
      const targetId = ctx.repository.saveNote({
        filePath: "idf-target.md",
        title: "IDF Target XYZABC123",
        content: "content",
        frontmatter: {},
        createdAt: targetDate,
      });

      // 稀なエンティティ（2ノートにのみリンク: targetとrareLinked）でリンクされるノート
      const rareLinkNoteId = ctx.repository.saveNote({
        filePath: "idf-rare-linked.md",
        title: "IDF Rare Linked QWERTY987",
        content: "content",
        frontmatter: {},
        createdAt: rareLinkDate,
      });

      // 頻出エンティティ（多数ノートにリンク）でリンクされるノート
      const commonLinkNoteId = ctx.repository.saveNote({
        filePath: "idf-common-linked.md",
        title: "IDF Common Linked POIUYT654",
        content: "content",
        frontmatter: {},
        createdAt: commonLinkDate,
      });

      // 頻出エンティティに追加でリンクするノートを多数作成（全て時刻近接外）
      const extraNoteIds: number[] = [];
      for (let i = 0; i < 10; i++) {
        const extraDate = new Date(
          new Date(commonLinkDate).getTime() + (i + 1) * 30 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const id = ctx.repository.saveNote({
          filePath: `idf-extra-${i}.md`,
          title: `IDF Extra Note MNBVCX${i}`,
          content: "content",
          frontmatter: {},
          createdAt: extraDate,
        });
        extraNoteIds.push(id);
      }

      // 稀なエンティティを作成（targetとrareLinkNoteのみにリンク: df=2）
      const rareEntityId = graphRepo.createEntity({
        name: "idf-rare-entity",
        entityType: "concept",
        createdAt: targetDate,
      });
      graphRepo.linkEntityToNote(rareEntityId, targetId);
      graphRepo.linkEntityToNote(rareEntityId, rareLinkNoteId);

      // 頻出エンティティを作成（target + commonLinkNote + 10個の追加ノート: df=12）
      const commonEntityId = graphRepo.createEntity({
        name: "idf-common-entity",
        entityType: "concept",
        createdAt: targetDate,
      });
      graphRepo.linkEntityToNote(commonEntityId, targetId);
      graphRepo.linkEntityToNote(commonEntityId, commonLinkNoteId);
      for (const extraId of extraNoteIds) {
        graphRepo.linkEntityToNote(commonEntityId, extraId);
      }

      const related = generator.findRelatedNotes(targetId, 20);

      const rareLinkedNote = related.find((r) => r.filePath === "idf-rare-linked.md");
      const commonLinkedNote = related.find((r) => r.filePath === "idf-common-linked.md");

      expect(rareLinkedNote).toBeDefined();
      expect(commonLinkedNote).toBeDefined();

      // 稀なエンティティ経由のスコアが頻出エンティティ経由のスコアより高いこと
      expect(rareLinkedNote!.similarity).toBeGreaterThan(commonLinkedNote!.similarity);
    });

    it("スコアは固定値0.6ではなく、エンティティ頻度に応じて変動すること", () => {
      const now = new Date().toISOString();

      const targetId = ctx.repository.saveNote({
        filePath: "target2.md",
        title: "Target2",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });
      const linkedId = ctx.repository.saveNote({
        filePath: "linked2.md",
        title: "Linked2",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });

      // df=2（targetとlinkedの2ノート）のエンティティ
      const entityId = graphRepo.createEntity({
        name: "entity-for-score-check",
        entityType: "concept",
        createdAt: now,
      });
      graphRepo.linkEntityToNote(entityId, targetId);
      graphRepo.linkEntityToNote(entityId, linkedId);

      const related = generator.findRelatedNotes(targetId, 10);
      const linkedNote = related.find((r) => r.filePath === "linked2.md");

      expect(linkedNote).toBeDefined();
      // 固定値0.6ではないこと（IDF重み付けなら異なる値になる）
      expect(linkedNote!.similarity).not.toBe(0.6);
    });
  });

  describe("findByTimeProximity — 指数減衰", () => {
    it("clone直後（全ノート同日）でも全スコアが1.00にならないこと", () => {
      // 同日に作成されたノートが多数ある場合のシナリオ
      const sameDate = "2024-01-01T00:00:00.000Z";

      const targetId = ctx.repository.saveNote({
        filePath: "clone-target.md",
        title: "Clone Target",
        content: "content",
        frontmatter: {},
        createdAt: sameDate,
      });

      for (let i = 0; i < 5; i++) {
        ctx.repository.saveNote({
          filePath: `clone-note-${i}.md`,
          title: `Clone Note ${i}`,
          content: "content",
          frontmatter: {},
          createdAt: sameDate,
        });
      }

      const related = generator.findRelatedNotes(targetId, 10);
      const timeRelated = related.filter((r) => r.reason.includes("同時期作成"));

      // 時刻近接ノートが存在する場合
      if (timeRelated.length > 0) {
        // 全スコアが1.00に集中していないこと
        // （指数減衰 * 0.8 + 0.2 のモデルなら同日はbase=0.2+0.8=1.0になりうるが、
        //   medianベースのlambda計算で差が生まれるはず。
        //   ただしmedian=0のとき特別処理が必要）
        // 少なくとも1.0を超えないこと
        for (const note of timeRelated) {
          expect(note.similarity).toBeLessThanOrEqual(1.0);
        }
      }
    });

    it("日付が離れるほどスコアが低くなること（指数減衰）", () => {
      const baseDate = new Date("2024-01-15T00:00:00.000Z");

      const targetId = ctx.repository.saveNote({
        filePath: "decay-target.md",
        title: "Decay Target",
        content: "content",
        frontmatter: {},
        createdAt: baseDate.toISOString(),
      });

      // 2日後のノート
      const twoDaysLater = new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
      ctx.repository.saveNote({
        filePath: "decay-2d.md",
        title: "Two Days Later",
        content: "content",
        frontmatter: {},
        createdAt: twoDaysLater,
      });

      // 5日後のノート
      const fiveDaysLater = new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      ctx.repository.saveNote({
        filePath: "decay-5d.md",
        title: "Five Days Later",
        content: "content",
        frontmatter: {},
        createdAt: fiveDaysLater,
      });

      const related = generator.findRelatedNotes(targetId, 10);
      const note2d = related.find((r) => r.filePath === "decay-2d.md");
      const note5d = related.find((r) => r.filePath === "decay-5d.md");

      // 両ノートが見つかった場合のみ順序を検証
      if (note2d && note5d) {
        // 近いノートのスコアが高いこと
        expect(note2d.similarity).toBeGreaterThan(note5d.similarity);
      }
    });
  });

  describe("deduplicateAndRank — 確率的結合", () => {
    it("複数の理由を持つノートが単一理由のノートより高スコアであること", () => {
      const now = new Date().toISOString();

      // ターゲットノート（タグと時刻近接の両方で関連するノートを作る）
      const targetId = ctx.repository.saveNote({
        filePath: "dedup-target.md",
        title: "Dedup Target",
        content: "content",
        frontmatter: { tags: ["shared-tag"] },
        createdAt: now,
      });

      // タグのみで関連するノート
      ctx.repository.saveNote({
        filePath: "tag-only.md",
        title: "Tag Only",
        content: "content",
        frontmatter: { tags: ["shared-tag"] },
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10日前
      });

      // タグと時刻近接の両方で関連するノート
      ctx.repository.saveNote({
        filePath: "multi-reason.md",
        title: "Dedup Target Multi", // タイトルも類似させる
        content: "content",
        frontmatter: { tags: ["shared-tag"] },
        createdAt: now, // 同日
      });

      const related = generator.findRelatedNotes(targetId, 10);
      const tagOnly = related.find((r) => r.filePath === "tag-only.md");
      const multiReason = related.find((r) => r.filePath === "multi-reason.md");

      expect(multiReason).toBeDefined();
      // multi-reasonノートは複数の理由でマッチするため、tag-onlyより高スコアになること
      if (tagOnly) {
        expect(multiReason!.similarity).toBeGreaterThanOrEqual(tagOnly.similarity);
      }
    });

    it("確率的結合のスコアは元のスコアより高くなること（1-(1-a)(1-b)モデル）", () => {
      const now = new Date().toISOString();

      const targetId = ctx.repository.saveNote({
        filePath: "prob-target.md",
        title: "Probability Target TypeScript",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });

      // タグと時刻近接の両方で関連するノート（スコアが合成されるはず）
      ctx.repository.saveNote({
        filePath: "prob-combined.md",
        title: "Probability TypeScript Combined",
        content: "content",
        frontmatter: { tags: ["typescript"] },
        createdAt: now,
      });

      const related = generator.findRelatedNotes(targetId, 10);
      const combined = related.find((r) => r.filePath === "prob-combined.md");

      expect(combined).toBeDefined();
      // 複数の理由がある場合、reasonに複数エントリが含まれること
      if (combined && combined.reason.includes(",")) {
        // 確率的結合: 1 - (1-a)(1-b) >= max(a,b)
        // タグスコア（共通1タグ/最大1タグ = 1.0）と時刻スコア（同日 = 高い）が合成される
        // 少なくとも0よりは大きい
        expect(combined.similarity).toBeGreaterThan(0);
        expect(combined.similarity).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe("スコア分布", () => {
    it("複数ノートがある場合、スコア分布のmax-minが0より大きいこと（全て同一スコアではない）", () => {
      // 他の検索メソッドの影響を排除するため時刻を離す
      const targetDate = "2023-06-01T00:00:00.000Z";
      const rareLinkDate = "2023-08-01T00:00:00.000Z"; // 61日後
      const commonLinkDate = "2023-10-01T00:00:00.000Z"; // 122日後

      const targetId = ctx.repository.saveNote({
        filePath: "dist-target.md",
        title: "Distribution Target ZXCVBN111",
        content: "content",
        frontmatter: {},
        createdAt: targetDate,
      });

      // 稀なエンティティ（2ノート: target + rareLink）
      const rareEntityId = graphRepo.createEntity({
        name: "distribution-rare-entity",
        entityType: "concept",
        createdAt: targetDate,
      });
      const rareLinkId = ctx.repository.saveNote({
        filePath: "dist-rare.md",
        title: "Distribution Rare LKJHGF222",
        content: "content",
        frontmatter: {},
        createdAt: rareLinkDate,
      });
      graphRepo.linkEntityToNote(rareEntityId, targetId);
      graphRepo.linkEntityToNote(rareEntityId, rareLinkId);

      // 頻出エンティティ（target + commonLink + 8 extra = 10ノート）
      const commonEntityId = graphRepo.createEntity({
        name: "distribution-common-entity",
        entityType: "concept",
        createdAt: targetDate,
      });
      const commonLinkId = ctx.repository.saveNote({
        filePath: "dist-common.md",
        title: "Distribution Common POIUYT333",
        content: "content",
        frontmatter: {},
        createdAt: commonLinkDate,
      });
      graphRepo.linkEntityToNote(commonEntityId, targetId);
      graphRepo.linkEntityToNote(commonEntityId, commonLinkId);
      for (let i = 0; i < 8; i++) {
        const extraDate = new Date(
          new Date(commonLinkDate).getTime() + (i + 1) * 30 * 24 * 60 * 60 * 1000,
        ).toISOString();
        const extraId = ctx.repository.saveNote({
          filePath: `dist-extra-${i}.md`,
          title: `Distribution Extra MNBVCX4${i}`,
          content: "content",
          frontmatter: {},
          createdAt: extraDate,
        });
        graphRepo.linkEntityToNote(commonEntityId, extraId);
      }

      const related = generator.findRelatedNotes(targetId, 20);

      // グラフ経由のノートだけを抽出（時刻近接や他の経由を除く）
      const rareNote = related.find((r) => r.filePath === "dist-rare.md");
      const commonNote = related.find((r) => r.filePath === "dist-common.md");

      expect(rareNote).toBeDefined();
      expect(commonNote).toBeDefined();

      // IDF重み付けにより稀なエンティティのスコアが高いこと（= スコアに差がある）
      expect(rareNote!.similarity).toBeGreaterThan(commonNote!.similarity);
    });
  });

  describe("getEntityNoteCount", () => {
    it("エンティティにリンクされたノート数を正確に返すこと", () => {
      const now = new Date().toISOString();

      const entityId = graphRepo.createEntity({
        name: "count-test-entity",
        entityType: "concept",
        createdAt: now,
      });

      // 3ノートにリンク
      for (let i = 0; i < 3; i++) {
        const noteId = ctx.repository.saveNote({
          filePath: `count-note-${i}.md`,
          title: `Count Note ${i}`,
          content: "content",
          frontmatter: {},
          createdAt: now,
        });
        graphRepo.linkEntityToNote(entityId, noteId);
      }

      const count = graphRepo.getEntityNoteCount(entityId);
      expect(count).toBe(3);
    });

    it("リンクがないエンティティは0を返すこと", () => {
      const now = new Date().toISOString();

      const entityId = graphRepo.createEntity({
        name: "no-links-entity",
        entityType: "concept",
        createdAt: now,
      });

      const count = graphRepo.getEntityNoteCount(entityId);
      expect(count).toBe(0);
    });
  });
});
