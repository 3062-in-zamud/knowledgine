import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GraphRepository } from "../../src/graph/graph-repository.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("GraphRepository (bi-temporal)", () => {
  let ctx: TestContext;
  let graph: GraphRepository;

  beforeEach(() => {
    ctx = createTestDb();
    graph = new GraphRepository(ctx.db);
  });

  afterEach(() => {
    ctx.db.close();
  });

  // ── Regression: existing functionality still works ─────────────────────

  describe("regression: createRelation / getRelationsByEntityId", () => {
    it("should create relation and retrieve it via active_relations VIEW", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "react", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "my-app", entityType: "project", createdAt: now });
      graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      const relations = graph.getRelationsByEntityId(fromId);
      expect(relations.length).toBe(1);
      expect(relations[0].relationType).toBe("uses");
    });

    it("should find related entities through active_relations", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({ name: "entity-a", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "entity-b", entityType: "project", createdAt: now });
      graph.createRelation({ fromEntityId: a, toEntityId: b, relationType: "uses", createdAt: now });

      const related = graph.findRelatedEntities(a, 1);
      expect(related.some((e) => e.id === b)).toBe(true);
    });

    it("getGraphStats should count only active relations and observations", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({ name: "stat-a", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "stat-b", entityType: "project", createdAt: now });
      graph.createRelation({ fromEntityId: a, toEntityId: b, relationType: "uses", createdAt: now });
      graph.createObservation({ entityId: a, content: "obs", observationType: "fact", createdAt: now });

      const stats = graph.getGraphStats();
      expect(stats.totalRelations).toBeGreaterThanOrEqual(1);
      expect(stats.totalObservations).toBeGreaterThanOrEqual(1);
    });
  });

  // ── New: bi-temporal columns set on INSERT ─────────────────────────────

  describe("createRelation sets bi-temporal columns", () => {
    it("should set valid_from and recorded_at on insert", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "from-a", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "to-a", entityType: "project", createdAt: now });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      const row = ctx.db
        .prepare("SELECT valid_from, recorded_at FROM relations WHERE id = ?")
        .get(relId) as { valid_from: string | null; recorded_at: string | null };
      expect(row.valid_from).not.toBeNull();
      expect(row.recorded_at).not.toBeNull();
    });
  });

  describe("createObservation sets bi-temporal columns", () => {
    it("should set valid_from and recorded_at on insert", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({ name: "obs-entity", entityType: "technology", createdAt: now });
      const obsId = graph.createObservation({
        entityId,
        content: "some fact",
        observationType: "fact",
        createdAt: now,
      });

      const row = ctx.db
        .prepare("SELECT valid_from, recorded_at FROM observations WHERE id = ?")
        .get(obsId) as { valid_from: string | null; recorded_at: string | null };
      expect(row.valid_from).not.toBeNull();
      expect(row.recorded_at).not.toBeNull();
    });
  });

  // ── New: invalidateRelation ────────────────────────────────────────────

  describe("invalidateRelation", () => {
    it("should set valid_to and exclude from active_relations VIEW", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "inv-from", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "inv-to", entityType: "project", createdAt: now });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      // 無効化前はVIEWで見える
      expect(graph.getRelationsByEntityId(fromId).length).toBe(1);

      const result = graph.invalidateRelation(relId);
      expect(result).toBe(true);

      // 無効化後はVIEWから除外
      expect(graph.getRelationsByEntityId(fromId).length).toBe(0);
    });

    it("should be idempotent (second call returns false)", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "idem-from", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "idem-to", entityType: "project", createdAt: now });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      expect(graph.invalidateRelation(relId)).toBe(true);
      expect(graph.invalidateRelation(relId)).toBe(false);
    });

    it("should accept custom validTo timestamp", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "custom-from", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "custom-to", entityType: "project", createdAt: now });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });

      const customTime = "2025-01-01T00:00:00";
      graph.invalidateRelation(relId, customTime);

      const row = ctx.db
        .prepare("SELECT valid_to FROM relations WHERE id = ?")
        .get(relId) as { valid_to: string };
      expect(row.valid_to).toBe(customTime);
    });

    it("should return false for non-existent id", () => {
      expect(graph.invalidateRelation(99999)).toBe(false);
    });
  });

  // ── New: invalidateObservation ─────────────────────────────────────────

  describe("invalidateObservation", () => {
    it("should set valid_to and exclude from active_observations VIEW", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({ name: "obs-inv-entity", entityType: "technology", createdAt: now });
      const obsId = graph.createObservation({
        entityId,
        content: "obs to invalidate",
        observationType: "fact",
        createdAt: now,
      });

      // 無効化前はVIEWで見える
      expect(graph.getObservationsByEntityId(entityId).length).toBe(1);

      const result = graph.invalidateObservation(obsId);
      expect(result).toBe(true);

      // 無効化後はVIEWから除外
      expect(graph.getObservationsByEntityId(entityId).length).toBe(0);
    });

    it("should be idempotent (second call returns false)", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({ name: "obs-idem", entityType: "technology", createdAt: now });
      const obsId = graph.createObservation({
        entityId,
        content: "obs idem",
        observationType: "fact",
        createdAt: now,
      });

      expect(graph.invalidateObservation(obsId)).toBe(true);
      expect(graph.invalidateObservation(obsId)).toBe(false);
    });
  });

  // ── New: getRelationHistory ────────────────────────────────────────────

  describe("getRelationHistory", () => {
    it("should return the relation including bi-temporal fields", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "hist-from", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "hist-to", entityType: "project", createdAt: now });

      // リレーションを作成して無効化
      const relId1 = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });
      graph.invalidateRelation(relId1);

      const history = graph.getRelationHistory(fromId, toId);
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(relId1);
      expect(history[0].validTo).not.toBeNull();
    });

    it("should return multiple relations with different types between same entities", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "hist-from2", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "hist-to2", entityType: "project", createdAt: now });

      // 異なるrelation_typeなら複数作成可能
      graph.createRelation({ fromEntityId: fromId, toEntityId: toId, relationType: "uses", createdAt: now });
      graph.createRelation({ fromEntityId: fromId, toEntityId: toId, relationType: "depends_on", createdAt: now });

      // getRelationHistory は同一ペアの全リレーションを返す
      const history = graph.getRelationHistory(fromId, toId);
      expect(history.length).toBe(2);
    });

    it("should include validTo info for invalidated relations", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "hv-from", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "hv-to", entityType: "project", createdAt: now });
      const relId = graph.createRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "uses",
        createdAt: now,
      });
      graph.invalidateRelation(relId);

      const history = graph.getRelationHistory(fromId, toId);
      expect(history.length).toBe(1);
      expect(history[0].validTo).not.toBeNull();
    });

    it("should return empty for no matching relations", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({ name: "empty-from", entityType: "technology", createdAt: now });
      const toId = graph.createEntity({ name: "empty-to", entityType: "project", createdAt: now });

      const history = graph.getRelationHistory(fromId, toId);
      expect(history).toEqual([]);
    });
  });

  // ── New: getEntityWithGraph excludes invalidated ────────────────────────

  describe("getEntityWithGraph with invalidated relations", () => {
    it("should not include invalidated outgoing relations", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({ name: "geg-a", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "geg-b", entityType: "project", createdAt: now });
      const relId = graph.createRelation({ fromEntityId: a, toEntityId: b, relationType: "uses", createdAt: now });

      // 無効化前は含まれる
      const before = graph.getEntityWithGraph(a);
      expect(before!.outgoingRelations.length).toBe(1);

      graph.invalidateRelation(relId);

      // 無効化後は含まれない
      const after = graph.getEntityWithGraph(a);
      expect(after!.outgoingRelations.length).toBe(0);
    });

    it("should not include invalidated incoming relations", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({ name: "geg-src", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "geg-dst", entityType: "project", createdAt: now });
      const relId = graph.createRelation({ fromEntityId: a, toEntityId: b, relationType: "uses", createdAt: now });

      graph.invalidateRelation(relId);

      const withGraph = graph.getEntityWithGraph(b);
      expect(withGraph!.incomingRelations.length).toBe(0);
    });

    it("should not include invalidated observations", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({ name: "geg-obs", entityType: "technology", createdAt: now });
      const obsId = graph.createObservation({
        entityId,
        content: "obs to remove",
        observationType: "fact",
        createdAt: now,
      });

      graph.invalidateObservation(obsId);

      const withGraph = graph.getEntityWithGraph(entityId);
      expect(withGraph!.observations.length).toBe(0);
    });
  });

  // ── New: findRelatedEntities skips invalidated ─────────────────────────

  describe("findRelatedEntities with invalidated relations", () => {
    it("should not traverse invalidated relations", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({ name: "bfs-a", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "bfs-b", entityType: "project", createdAt: now });
      const relId = graph.createRelation({ fromEntityId: a, toEntityId: b, relationType: "uses", createdAt: now });

      // 無効化前は見つかる
      expect(graph.findRelatedEntities(a, 1).some((e) => e.id === b)).toBe(true);

      graph.invalidateRelation(relId);

      // 無効化後は見つからない
      expect(graph.findRelatedEntities(a, 1).some((e) => e.id === b)).toBe(false);
    });
  });

  // ── New: getGraphStats excludes invalidated ────────────────────────────

  describe("getGraphStats with invalidated relations/observations", () => {
    it("should not count invalidated relations", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({ name: "gstats-a", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "gstats-b", entityType: "project", createdAt: now });
      const relId = graph.createRelation({ fromEntityId: a, toEntityId: b, relationType: "uses", createdAt: now });

      const before = graph.getGraphStats();
      graph.invalidateRelation(relId);
      const after = graph.getGraphStats();

      expect(after.totalRelations).toBe(before.totalRelations - 1);
    });

    it("should not count invalidated observations", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({ name: "gstats-obs", entityType: "technology", createdAt: now });
      const obsId = graph.createObservation({
        entityId,
        content: "obs to count",
        observationType: "fact",
        createdAt: now,
      });

      const before = graph.getGraphStats();
      graph.invalidateObservation(obsId);
      const after = graph.getGraphStats();

      expect(after.totalObservations).toBe(before.totalObservations - 1);
    });
  });

  // ── Performance: BFS on large graph ────────────────────────────────────

  describe("performance: findRelatedEntities on large graph", () => {
    it("should complete within 100ms for 10,000 relations with 30% invalidated", () => {
      const now = new Date().toISOString();

      // エンティティを200個作成
      const entityIds: number[] = [];
      const insertEntity = ctx.db.transaction(() => {
        for (let i = 0; i < 200; i++) {
          entityIds.push(
            graph.createEntity({ name: `perf-entity-${i}`, entityType: "concept", createdAt: now }),
          );
        }
      });
      insertEntity();

      // 10,000 relationsを挿入（ランダムな接続、UNIQUE制約回避のためOR IGNORE）
      const insertRelations = ctx.db.transaction(() => {
        for (let i = 0; i < 10000; i++) {
          const fromIdx = i % 200;
          const toIdx = (i * 7 + 13) % 200;
          if (fromIdx !== toIdx) {
            ctx.db
              .prepare(
                `INSERT OR IGNORE INTO relations (from_entity_id, to_entity_id, relation_type, strength, created_at, valid_from, recorded_at)
                 VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
              )
              .run(entityIds[fromIdx], entityIds[toIdx], "related_to", 1.0, now);
          }
        }
      });
      insertRelations();

      // 30%のrelationを無効化
      const allRelIds = ctx.db
        .prepare("SELECT id FROM relations")
        .all() as Array<{ id: number }>;
      const toInvalidate = allRelIds.slice(0, Math.floor(allRelIds.length * 0.3));
      const invalidateMany = ctx.db.transaction(() => {
        for (const { id } of toInvalidate) {
          ctx.db
            .prepare(`UPDATE relations SET valid_to = datetime('now') WHERE id = ?`)
            .run(id);
        }
      });
      invalidateMany();

      // BFS実行時間を測定
      const start = Date.now();
      graph.findRelatedEntities(entityIds[0], 2);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });
});
