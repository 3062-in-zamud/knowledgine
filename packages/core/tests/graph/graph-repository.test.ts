import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GraphRepository } from "../../src/graph/graph-repository.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("GraphRepository", () => {
  let ctx: TestContext;
  let graph: GraphRepository;

  beforeEach(() => {
    ctx = createTestDb();
    graph = new GraphRepository(ctx.db);
  });

  afterEach(() => {
    ctx.db.close();
  });

  // ── Entity CRUD ──────────────────────────────────────────────────

  describe("createEntity", () => {
    it("should create an entity and return its id", () => {
      const id = graph.createEntity({
        name: "TypeScript",
        entityType: "technology",
        createdAt: new Date().toISOString(),
      });
      expect(id).toBeGreaterThan(0);
    });

    it("should normalize name to lowercase", () => {
      const id = graph.createEntity({
        name: "TypeScript",
        entityType: "technology",
        createdAt: new Date().toISOString(),
      });
      const entity = graph.getEntityById(id);
      expect(entity!.name).toBe("typescript");
    });

    it("should throw on empty name", () => {
      expect(() =>
        graph.createEntity({
          name: "",
          entityType: "technology",
          createdAt: new Date().toISOString(),
        }),
      ).toThrow();
    });
  });

  describe("upsertEntity", () => {
    it("should return the same id for duplicate (name, entityType)", () => {
      const now = new Date().toISOString();
      const id1 = graph.upsertEntity({ name: "React", entityType: "technology", createdAt: now });
      const id2 = graph.upsertEntity({ name: "react", entityType: "technology", createdAt: now });
      expect(id1).toBe(id2);
    });

    it("should update description on upsert", () => {
      const now = new Date().toISOString();
      graph.upsertEntity({ name: "vue", entityType: "technology", createdAt: now });
      graph.upsertEntity({
        name: "vue",
        entityType: "technology",
        description: "Progressive JS framework",
        createdAt: now,
      });
      const entity = graph.getEntityByName("vue", "technology");
      expect(entity!.description).toBe("Progressive JS framework");
    });
  });

  describe("getEntityByName", () => {
    it("should find entity by name (case-insensitive)", () => {
      graph.createEntity({
        name: "nodejs",
        entityType: "technology",
        createdAt: new Date().toISOString(),
      });
      const entity = graph.getEntityByName("NodeJS");
      expect(entity).toBeDefined();
      expect(entity!.name).toBe("nodejs");
    });

    it("should return undefined for unknown entity", () => {
      expect(graph.getEntityByName("nonexistent")).toBeUndefined();
    });
  });

  describe("searchEntities", () => {
    beforeEach(() => {
      const now = new Date().toISOString();
      graph.createEntity({ name: "typescript", entityType: "technology", createdAt: now });
      graph.createEntity({ name: "javascript", entityType: "technology", createdAt: now });
      graph.createEntity({ name: "python", entityType: "technology", createdAt: now });
    });

    it("should find entities with 3+ char query via FTS", () => {
      const results = graph.searchEntities("typescript");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("typescript");
    });

    it("should use LIKE fallback for short queries", () => {
      const results = graph.searchEntities("py");
      expect(results.some((e) => e.name === "python")).toBe(true);
    });

    it("should respect limit", () => {
      const results = graph.searchEntities("script", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("deleteEntity", () => {
    it("should delete entity and return true", () => {
      const id = graph.createEntity({
        name: "to-delete",
        entityType: "concept",
        createdAt: new Date().toISOString(),
      });
      expect(graph.deleteEntity(id)).toBe(true);
      expect(graph.getEntityById(id)).toBeUndefined();
    });

    it("should return false for non-existent id", () => {
      expect(graph.deleteEntity(99999)).toBe(false);
    });
  });

  // ── Relation CRUD ─────────────────────────────────────────────────

  describe("createRelation / getRelationsByEntityId", () => {
    it("should create relation and retrieve it", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({
        name: "react",
        entityType: "technology",
        createdAt: now,
      });
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
  });

  describe("upsertRelation", () => {
    it("should update strength to MAX value", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({
        name: "lib-a",
        entityType: "technology",
        createdAt: now,
      });
      const toId = graph.createEntity({ name: "lib-b", entityType: "technology", createdAt: now });

      graph.upsertRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "depends_on",
        strength: 0.3,
        createdAt: now,
      });
      graph.upsertRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "depends_on",
        strength: 0.8,
        createdAt: now,
      });

      const relations = graph.getRelationsByEntityId(fromId);
      expect(relations[0].strength).toBe(0.8);
    });

    it("should keep higher strength even when new value is lower", () => {
      const now = new Date().toISOString();
      const fromId = graph.createEntity({
        name: "lib-c",
        entityType: "technology",
        createdAt: now,
      });
      const toId = graph.createEntity({ name: "lib-d", entityType: "technology", createdAt: now });

      graph.upsertRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "related_to",
        strength: 0.9,
        createdAt: now,
      });
      graph.upsertRelation({
        fromEntityId: fromId,
        toEntityId: toId,
        relationType: "related_to",
        strength: 0.1,
        createdAt: now,
      });

      const relations = graph.getRelationsByEntityId(fromId);
      expect(relations[0].strength).toBe(0.9);
    });
  });

  // ── Observation CRUD ──────────────────────────────────────────────

  describe("createObservation / getObservationsByEntityId", () => {
    it("should create and retrieve observations", () => {
      const now = new Date().toISOString();
      const entityId = graph.createEntity({
        name: "ts-obs",
        entityType: "technology",
        createdAt: now,
      });
      graph.createObservation({
        entityId,
        content: "Has excellent type inference",
        observationType: "fact",
        createdAt: now,
      });

      const obs = graph.getObservationsByEntityId(entityId);
      expect(obs.length).toBe(1);
      expect(obs[0].content).toBe("Has excellent type inference");
    });
  });

  // ── Entity-Note Links ─────────────────────────────────────────────

  describe("linkEntityToNote / getLinkedNotes / getLinkedEntities", () => {
    it("should link entity to note and retrieve both directions", () => {
      const now = new Date().toISOString();
      const noteId = ctx.repository.saveNote({
        filePath: "test.md",
        title: "Test",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });
      const entityId = graph.createEntity({
        name: "linked-tech",
        entityType: "technology",
        createdAt: now,
      });
      graph.linkEntityToNote(entityId, noteId);

      const linked = graph.getLinkedNotes(entityId);
      expect(linked.length).toBe(1);
      expect(linked[0].noteId).toBe(noteId);

      const entities = graph.getLinkedEntities(noteId);
      expect(entities.length).toBe(1);
      expect(entities[0].name).toBe("linked-tech");
    });

    it("should ignore duplicate links (INSERT OR IGNORE)", () => {
      const now = new Date().toISOString();
      const noteId = ctx.repository.saveNote({
        filePath: "dup.md",
        title: "Dup",
        content: "c",
        frontmatter: {},
        createdAt: now,
      });
      const entityId = graph.createEntity({
        name: "dup-entity",
        entityType: "concept",
        createdAt: now,
      });
      graph.linkEntityToNote(entityId, noteId);
      graph.linkEntityToNote(entityId, noteId); // should not throw
      expect(graph.getLinkedNotes(entityId).length).toBe(1);
    });
  });

  // ── Graph Traversal ───────────────────────────────────────────────

  describe("findRelatedEntities", () => {
    it("should find entities within 1 hop", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({ name: "entity-a", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "entity-b", entityType: "project", createdAt: now });
      graph.createRelation({
        fromEntityId: a,
        toEntityId: b,
        relationType: "uses",
        createdAt: now,
      });

      const related = graph.findRelatedEntities(a, 1);
      expect(related.some((e) => e.id === b)).toBe(true);
      expect(related[0].hops).toBe(1);
    });

    it("should not return the start entity itself", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({
        name: "self-start",
        entityType: "technology",
        createdAt: now,
      });
      const b = graph.createEntity({
        name: "self-neighbor",
        entityType: "project",
        createdAt: now,
      });
      graph.createRelation({
        fromEntityId: a,
        toEntityId: b,
        relationType: "related_to",
        createdAt: now,
      });

      const related = graph.findRelatedEntities(a, 1);
      expect(related.every((e) => e.id !== a)).toBe(true);
    });

    it("should handle circular graphs without infinite loop (A→B→A)", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({
        name: "circular-a",
        entityType: "technology",
        createdAt: now,
      });
      const b = graph.createEntity({
        name: "circular-b",
        entityType: "technology",
        createdAt: now,
      });
      graph.createRelation({
        fromEntityId: a,
        toEntityId: b,
        relationType: "related_to",
        createdAt: now,
      });
      graph.createRelation({
        fromEntityId: b,
        toEntityId: a,
        relationType: "related_to",
        createdAt: now,
      });

      // Should complete without hanging
      const related = graph.findRelatedEntities(a, 3);
      expect(Array.isArray(related)).toBe(true);
      // Should only visit each entity once
      const ids = related.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("should cap maxHops at 3", () => {
      const now = new Date().toISOString();
      // Chain: a → b → c → d → e
      const ids: number[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(graph.createEntity({ name: `chain-${i}`, entityType: "concept", createdAt: now }));
      }
      for (let i = 0; i < 4; i++) {
        graph.createRelation({
          fromEntityId: ids[i],
          toEntityId: ids[i + 1],
          relationType: "related_to",
          createdAt: now,
        });
      }

      // maxHops=10 should be capped at 3, so entity at hop 4 (ids[4]) should not be reachable
      const related = graph.findRelatedEntities(ids[0], 10);
      expect(related.some((e) => e.id === ids[4])).toBe(false);
      expect(related.some((e) => e.id === ids[3])).toBe(true); // hop 3 is included
    });

    it("should return empty for isolated entity", () => {
      const id = graph.createEntity({
        name: "isolated",
        entityType: "concept",
        createdAt: new Date().toISOString(),
      });
      const related = graph.findRelatedEntities(id, 2);
      expect(related).toEqual([]);
    });
  });

  // ── Stats ─────────────────────────────────────────────────────────

  describe("getGraphStats", () => {
    it("should return correct counts", () => {
      const now = new Date().toISOString();
      const a = graph.createEntity({ name: "stat-a", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "stat-b", entityType: "project", createdAt: now });
      graph.createRelation({
        fromEntityId: a,
        toEntityId: b,
        relationType: "uses",
        createdAt: now,
      });
      graph.createObservation({
        entityId: a,
        content: "test obs",
        observationType: "fact",
        createdAt: now,
      });

      const stats = graph.getGraphStats();
      expect(stats.totalEntities).toBeGreaterThanOrEqual(2);
      expect(stats.totalRelations).toBeGreaterThanOrEqual(1);
      expect(stats.totalObservations).toBeGreaterThanOrEqual(1);
      expect(stats.entitiesByType["technology"]).toBeGreaterThanOrEqual(1);
      expect(stats.relationsByType["uses"]).toBeGreaterThanOrEqual(1);
    });
  });

  // ── getEntityWithGraph ────────────────────────────────────────────

  describe("getEntityWithGraph", () => {
    it("should include observations, outgoing/incoming relations, and linked notes", () => {
      const now = new Date().toISOString();
      const noteId = ctx.repository.saveNote({
        filePath: "graph-test.md",
        title: "Graph Test",
        content: "content",
        frontmatter: {},
        createdAt: now,
      });
      const a = graph.createEntity({ name: "graph-a", entityType: "technology", createdAt: now });
      const b = graph.createEntity({ name: "graph-b", entityType: "project", createdAt: now });
      graph.createRelation({
        fromEntityId: a,
        toEntityId: b,
        relationType: "uses",
        createdAt: now,
      });
      graph.createObservation({
        entityId: a,
        content: "obs content",
        observationType: "insight",
        createdAt: now,
      });
      graph.linkEntityToNote(a, noteId);

      const withGraph = graph.getEntityWithGraph(a);
      expect(withGraph).toBeDefined();
      expect(withGraph!.observations.length).toBe(1);
      expect(withGraph!.outgoingRelations.length).toBe(1);
      expect(withGraph!.incomingRelations.length).toBe(0);
      expect(withGraph!.linkedNotes.length).toBe(1);
    });

    it("should return undefined for non-existent entity", () => {
      expect(graph.getEntityWithGraph(99999)).toBeUndefined();
    });
  });
});
