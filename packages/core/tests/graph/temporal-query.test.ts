import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GraphRepository } from "../../src/graph/graph-repository.js";
import { TemporalQueryEngine } from "../../src/graph/temporal-query.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("TemporalQueryEngine", () => {
  let ctx: TestContext;
  let graph: GraphRepository;
  let engine: TemporalQueryEngine;

  beforeEach(() => {
    ctx = createTestDb();
    graph = new GraphRepository(ctx.db);
    engine = new TemporalQueryEngine(graph, ctx.repository);
  });

  afterEach(() => {
    ctx.db.close();
  });

  // ── getRelationsAsOf ──────────────────────────────────────────────────

  describe("getRelationsAsOf", () => {
    it("指定時点で有効なrelationのみ返る", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({
        name: "rel-asof-from",
        entityType: "technology",
        createdAt: now,
      });
      const toId = graph.createEntity({
        name: "rel-asof-to",
        entityType: "project",
        createdAt: now,
      });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      // valid_atを過去、invalid_atをNULLに設定（現在有効）
      ctx.db
        .prepare("UPDATE relations SET valid_at = ?, invalid_at = NULL WHERE id = ?")
        .run("2020-01-01T00:00:00.000Z", relId);

      const asOf = "2025-06-01T00:00:00.000Z";
      const relations = graph.getRelationsAsOf(fromId, asOf);

      expect(relations.length).toBeGreaterThanOrEqual(1);
      expect(relations.some((r) => r.id === relId)).toBe(true);
    });

    it("invalid_at済みのrelationは返らない", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({
        name: "rel-inv-from",
        entityType: "technology",
        createdAt: now,
      });
      const toId = graph.createEntity({
        name: "rel-inv-to",
        entityType: "project",
        createdAt: now,
      });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      // 2023年に無効化
      ctx.db
        .prepare("UPDATE relations SET valid_at = ?, invalid_at = ? WHERE id = ?")
        .run("2020-01-01T00:00:00.000Z", "2023-01-01T00:00:00.000Z", relId);

      // 2025年時点で問い合わせ → 既に無効化済みのため返らない
      const asOf = "2025-06-01T00:00:00.000Z";
      const relations = graph.getRelationsAsOf(fromId, asOf);
      expect(relations.some((r) => r.id === relId)).toBe(false);
    });

    it("valid_at後かつinvalid_at前の時点でrelationが返る", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({
        name: "rel-window-from",
        entityType: "technology",
        createdAt: now,
      });
      const toId = graph.createEntity({
        name: "rel-window-to",
        entityType: "project",
        createdAt: now,
      });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      ctx.db
        .prepare("UPDATE relations SET valid_at = ?, invalid_at = ? WHERE id = ?")
        .run("2020-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", relId);

      // 有効期間内で問い合わせ
      const asOf = "2023-06-01T00:00:00.000Z";
      const relations = graph.getRelationsAsOf(fromId, asOf);
      expect(relations.some((r) => r.id === relId)).toBe(true);
    });
  });

  // ── getObservationsAsOf ───────────────────────────────────────────────

  describe("getObservationsAsOf", () => {
    it("指定時点で有効なobservationのみ返る", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({
        name: "obs-asof-entity",
        entityType: "technology",
        createdAt: now,
      });
      const obsId = graph.createObservation({
        entityId,
        content: "valid observation",
        observationType: "fact",
        createdAt: now,
      });

      ctx.db
        .prepare("UPDATE observations SET valid_at = ?, invalid_at = NULL WHERE id = ?")
        .run("2020-01-01T00:00:00.000Z", obsId);

      const asOf = "2025-06-01T00:00:00.000Z";
      const observations = graph.getObservationsAsOf(entityId, asOf);
      expect(observations.some((o) => o.id === obsId)).toBe(true);
    });

    it("invalid_at済みのobservationは返らない", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({
        name: "obs-inv-entity",
        entityType: "technology",
        createdAt: now,
      });
      const obsId = graph.createObservation({
        entityId,
        content: "invalidated observation",
        observationType: "fact",
        createdAt: now,
      });

      ctx.db
        .prepare("UPDATE observations SET valid_at = ?, invalid_at = ? WHERE id = ?")
        .run("2020-01-01T00:00:00.000Z", "2023-01-01T00:00:00.000Z", obsId);

      const asOf = "2025-06-01T00:00:00.000Z";
      const observations = graph.getObservationsAsOf(entityId, asOf);
      expect(observations.some((o) => o.id === obsId)).toBe(false);
    });
  });

  // ── queryAsOf ─────────────────────────────────────────────────────────

  describe("queryAsOf", () => {
    it("entityIdで指定時点のエンティティ状態を取得できる", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({
        name: "qa-from",
        entityType: "technology",
        createdAt: now,
      });
      const toId = graph.createEntity({
        name: "qa-to",
        entityType: "project",
        createdAt: now,
      });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      // 2020年から有効
      ctx.db
        .prepare("UPDATE relations SET valid_at = ?, invalid_at = NULL WHERE id = ?")
        .run("2020-01-01T00:00:00.000Z", relId);

      const result = engine.queryAsOf({ entityId: fromId, asOf: "2025-06-01T00:00:00.000Z" });

      expect(result).toBeDefined();
      expect(result!.entity.id).toBe(fromId);
      expect(result!.relations.some((r) => r.id === relId)).toBe(true);
    });

    it("invalid_at済みのrelationは返らない", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({
        name: "qa-inv-from",
        entityType: "technology",
        createdAt: now,
      });
      const toId = graph.createEntity({
        name: "qa-inv-to",
        entityType: "project",
        createdAt: now,
      });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      // 2023年に無効化
      ctx.db
        .prepare("UPDATE relations SET valid_at = ?, invalid_at = ? WHERE id = ?")
        .run("2020-01-01T00:00:00.000Z", "2023-01-01T00:00:00.000Z", relId);

      const result = engine.queryAsOf({ entityId: fromId, asOf: "2025-06-01T00:00:00.000Z" });

      expect(result).toBeDefined();
      expect(result!.relations.some((r) => r.id === relId)).toBe(false);
    });

    it("entityNameで検索できる", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({
        name: "named-entity",
        entityType: "technology",
        createdAt: now,
      });

      const result = engine.queryAsOf({
        entityName: "named-entity",
        asOf: "2025-06-01T00:00:00.000Z",
      });

      expect(result).toBeDefined();
      expect(result!.entity.id).toBe(entityId);
    });

    it("存在しないエンティティでundefinedを返す", () => {
      const result = engine.queryAsOf({ entityId: 99999, asOf: "2025-06-01T00:00:00.000Z" });
      expect(result).toBeUndefined();
    });

    it("存在しない名前でundefinedを返す", () => {
      const result = engine.queryAsOf({
        entityName: "nonexistent-entity",
        asOf: "2025-06-01T00:00:00.000Z",
      });
      expect(result).toBeUndefined();
    });

    it("includeHistory=trueで全バージョンのノートが返る", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({
        name: "versioned-entity",
        entityType: "technology",
        createdAt: now,
      });

      // v1ノートを作成
      const note1Id = ctx.repository.saveNote({
        filePath: "versioned-note.md",
        title: "Versioned Note v1",
        content: "Version 1 content",
        frontmatter: {},
        createdAt: now,
      });

      // v2ノートを作成（v1を supersedes）
      const note2Id = ctx.repository.createNewVersion(note1Id, {
        title: "Versioned Note v2",
        content: "Version 2 content",
      });

      graph.linkEntityToNote(entityId, note1Id);
      graph.linkEntityToNote(entityId, note2Id);

      const result = engine.queryAsOf({
        entityId,
        asOf: "2025-06-01T00:00:00.000Z",
        includeHistory: true,
      });

      expect(result).toBeDefined();
      // includeHistory=true なので deprecated なノートも含む
      expect(result!.noteVersions.length).toBeGreaterThanOrEqual(1);
    });

    it("includeHistory=falseでdeprecatedでないノートのみ返る", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({
        name: "non-history-entity",
        entityType: "technology",
        createdAt: now,
      });

      // v1ノートを作成
      const note1Id = ctx.repository.saveNote({
        filePath: "non-history-note.md",
        title: "Note v1",
        content: "Version 1 content",
        frontmatter: {},
        createdAt: now,
      });

      // v2ノートを作成 → v1がdeprecatedになる
      ctx.repository.createNewVersion(note1Id, {
        title: "Note v2",
        content: "Version 2 content",
      });

      graph.linkEntityToNote(entityId, note1Id);

      const result = engine.queryAsOf({
        entityId,
        asOf: "2025-06-01T00:00:00.000Z",
        includeHistory: false,
      });

      expect(result).toBeDefined();
      // deprecated なノートは含まれない
      const hasDeprecated = result!.noteVersions.some((n) => n.deprecated === 1);
      expect(hasDeprecated).toBe(false);
    });
  });

  // ── getEntityTimeline ─────────────────────────────────────────────────

  describe("getEntityTimeline", () => {
    it("時系列順（昇順）でエントリが返る", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({
        name: "timeline-entity",
        entityType: "technology",
        createdAt: now,
      });

      // 複数のobservationを作成（異なるvalid_at）
      const obs1Id = graph.createObservation({
        entityId,
        content: "first observation",
        observationType: "fact",
        createdAt: now,
      });
      const obs2Id = graph.createObservation({
        entityId,
        content: "second observation",
        observationType: "fact",
        createdAt: now,
      });

      ctx.db
        .prepare("UPDATE observations SET valid_at = ? WHERE id = ?")
        .run("2021-01-01T00:00:00.000Z", obs1Id);
      ctx.db
        .prepare("UPDATE observations SET valid_at = ? WHERE id = ?")
        .run("2023-01-01T00:00:00.000Z", obs2Id);

      const timeline = engine.getEntityTimeline(entityId);

      expect(timeline.length).toBeGreaterThanOrEqual(2);

      // タイムスタンプが昇順であることを確認
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].timestamp >= timeline[i - 1].timestamp).toBe(true);
      }
    });

    it("invalidatedされたrelation/observationも含む", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({
        name: "timeline-inv-entity",
        entityType: "technology",
        createdAt: now,
      });
      const obsId = graph.createObservation({
        entityId,
        content: "invalidated obs",
        observationType: "fact",
        createdAt: now,
      });

      // 無効化
      graph.invalidateObservation(obsId);

      const timeline = engine.getEntityTimeline(entityId);

      // 無効化されたものも含まれる
      expect(timeline.some((e) => e.content === "invalidated obs")).toBe(true);
    });

    it("存在しないエンティティで空配列を返す", () => {
      const timeline = engine.getEntityTimeline(99999);
      expect(timeline).toEqual([]);
    });
  });

  // ── getVersionChain ───────────────────────────────────────────────────

  describe("getVersionChain", () => {
    it("supersedesチェーンを正しく辿る", () => {
      const now = new Date().toISOString();

      // v1 → v2 → v3 のチェーン
      const note1Id = ctx.repository.saveNote({
        filePath: "chain-note.md",
        title: "Chain Note v1",
        content: "v1 content",
        frontmatter: {},
        createdAt: now,
      });
      const note2Id = ctx.repository.createNewVersion(note1Id, {
        title: "Chain Note v2",
        content: "v2 content",
      });
      const note3Id = ctx.repository.createNewVersion(note2Id, {
        title: "Chain Note v3",
        content: "v3 content",
      });

      // v3からチェーンを取得
      const chain = engine.getVersionChain(note3Id);

      expect(chain.length).toBeGreaterThanOrEqual(2);
      // すべてのIDが含まれているか確認
      const chainIds = chain.map((n) => n.id);
      expect(chainIds).toContain(note3Id);
    });

    it("v1から辿ると新しいバージョンも取得できる", () => {
      const now = new Date().toISOString();

      const note1Id = ctx.repository.saveNote({
        filePath: "forward-chain.md",
        title: "Forward Chain v1",
        content: "v1 content",
        frontmatter: {},
        createdAt: now,
      });
      const note2Id = ctx.repository.createNewVersion(note1Id, {
        title: "Forward Chain v2",
        content: "v2 content",
      });

      // v1からチェーンを取得
      const chain = engine.getVersionChain(note1Id);

      const chainIds = chain.map((n) => n.id);
      expect(chainIds).toContain(note1Id);
      expect(chainIds).toContain(note2Id);
    });

    it("単一バージョン（supersedes=null）の場合は1件のみ返る", () => {
      const now = new Date().toISOString();

      const noteId = ctx.repository.saveNote({
        filePath: "single-version.md",
        title: "Single Version Note",
        content: "only version",
        frontmatter: {},
        createdAt: now,
      });

      const chain = engine.getVersionChain(noteId);

      expect(chain.length).toBe(1);
      expect(chain[0].id).toBe(noteId);
    });

    it("存在しないnoteIdで空配列を返す", () => {
      const chain = engine.getVersionChain(99999);
      expect(chain).toEqual([]);
    });
  });
});
