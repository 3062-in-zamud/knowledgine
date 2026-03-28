import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { KnowledgeService } from "../../src/index.js";
import { GraphRepository } from "../../src/index.js";
import { FeedbackRepository } from "../../src/index.js";

describe("KnowledgeService", () => {
  let ctx: TestContext;
  let graphRepository: GraphRepository;
  let feedbackRepository: FeedbackRepository;
  let service: KnowledgeService;

  beforeEach(() => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    graphRepository = new GraphRepository(ctx.db);
    feedbackRepository = new FeedbackRepository(ctx.db);
    service = new KnowledgeService({
      repository: ctx.repository,
      graphRepository,
      feedbackRepository,
    });
  });

  afterEach(() => {
    ctx.db.close();
  });

  // ── search ──────────────────────────────────────────────────

  describe("search", () => {
    it("should return results for a matching query", async () => {
      const result = await service.search({ query: "TypeScript" });
      expect(result.query).toBe("TypeScript");
      expect(result.mode).toBe("keyword");
      expect(result.totalResults).toBeGreaterThanOrEqual(1);
      expect(result.results[0]).toHaveProperty("noteId");
      expect(result.results[0]).toHaveProperty("filePath");
      expect(result.results[0]).toHaveProperty("title");
      expect(result.results[0]).toHaveProperty("score");
      expect(result.results[0]).toHaveProperty("matchReason");
      expect(result.results[0]).toHaveProperty("createdAt");
    });

    it("should return empty results for non-matching query", async () => {
      const result = await service.search({ query: "nonexistent_zzz_query" });
      expect(result.totalResults).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it("should respect limit option", async () => {
      const result = await service.search({ query: "TypeScript", limit: 1 });
      expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it("should default mode to keyword", async () => {
      const result = await service.search({ query: "TypeScript" });
      expect(result.mode).toBe("keyword");
    });

    it("should fall back to keyword search when semantic mode but no embeddingProvider", async () => {
      // embeddingProvider未提供でsemantic modeはkeywordフォールバック
      const result = await service.search({ query: "TypeScript", mode: "semantic" });
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
    });

    it("should set actualMode equal to mode for keyword search", async () => {
      const result = await service.search({ query: "TypeScript", mode: "keyword" });
      expect(result.mode).toBe("keyword");
      expect(result.actualMode).toBe("keyword");
    });

    it("should set actualMode to keyword when semantic mode falls back due to no embeddingProvider", async () => {
      const result = await service.search({ query: "TypeScript", mode: "semantic" });
      expect(result.mode).toBe("semantic");
      expect(result.actualMode).toBe("keyword");
    });

    it("should set actualMode to keyword when hybrid mode falls back due to no embeddingProvider", async () => {
      const result = await service.search({ query: "TypeScript", mode: "hybrid" });
      expect(result.mode).toBe("hybrid");
      expect(result.actualMode).toBe("keyword");
    });
  });

  // ── findRelated ──────────────────────────────────────────────

  describe("findRelated", () => {
    it("should find related notes by noteId", async () => {
      const result = await service.findRelated({ noteId: 1 });
      expect(result.noteId).toBe(1);
      expect(result).toHaveProperty("relatedNotes");
      expect(result).toHaveProperty("problemSolutionPairs");
      expect(result).toHaveProperty("graphRelations");
    });

    it("should find related notes by filePath", async () => {
      const result = await service.findRelated({ filePath: "typescript-guide.md" });
      expect(result.noteId).toBe(1);
    });

    it("should throw error when neither noteId nor filePath nor entityName provided", async () => {
      await expect(service.findRelated({})).rejects.toThrow(
        "Either noteId, filePath, or entityName is required",
      );
    });

    it("should throw error for non-existent filePath", async () => {
      await expect(service.findRelated({ filePath: "nonexistent.md" })).rejects.toThrow(
        "Note not found for path: nonexistent.md",
      );
    });

    it("should throw error for path traversal", async () => {
      await expect(service.findRelated({ filePath: "../outside.md" })).rejects.toThrow(
        "Invalid file path: outside of root directory",
      );
    });

    it("should return graphRelations when graphRepository is provided", async () => {
      const result = await service.findRelated({ noteId: 1 });
      expect(Array.isArray(result.graphRelations)).toBe(true);
    });

    it("should resolve entityName to a noteId via graph (KNOW-357)", async () => {
      const entityId = graphRepository.createEntity({
        name: "Docker",
        entityType: "technology",
        createdAt: new Date().toISOString(),
      });
      graphRepository.linkEntityToNote(entityId, 1);

      const result = await service.findRelated({ entityName: "Docker" });
      expect(result.noteId).toBe(1);
      expect(result).toHaveProperty("relatedNotes");
    });

    it("should throw when entityName matches no entity", async () => {
      await expect(service.findRelated({ entityName: "NonExistentXYZ" })).rejects.toThrow(
        "No entity found matching: NonExistentXYZ",
      );
    });

    it("should still accept integer noteId (backward compat)", async () => {
      const result = await service.findRelated({ noteId: 1 });
      expect(result.noteId).toBe(1);
    });
  });

  // ── getStats ─────────────────────────────────────────────────

  describe("getStats", () => {
    it("should return stats with note count", () => {
      const stats = service.getStats();
      expect(stats.totalNotes).toBe(3);
      expect(stats).toHaveProperty("totalPatterns");
      expect(stats).toHaveProperty("totalLinks");
      expect(stats).toHaveProperty("totalPairs");
      expect(stats).toHaveProperty("patternsByType");
    });

    it("should include embeddingStatus with available=false when no provider", () => {
      const stats = service.getStats();
      expect(stats.embeddingStatus.available).toBe(false);
      expect(stats.embeddingStatus.notesWithoutEmbeddings).toBeNull();
    });

    it("should include graphStats when graphRepository is provided", () => {
      const stats = service.getStats();
      expect(stats.graphStats).not.toBeNull();
      expect(stats.graphStats).toHaveProperty("totalEntities");
      expect(stats.graphStats).toHaveProperty("totalRelations");
    });

    it("should return null graphStats when graphRepository not provided", () => {
      const svcNoGraph = new KnowledgeService({ repository: ctx.repository });
      const stats = svcNoGraph.getStats();
      expect(stats.graphStats).toBeNull();
    });
  });

  // ── searchEntities ────────────────────────────────────────────

  describe("searchEntities", () => {
    it("should return entities when graphRepository is provided", () => {
      // エンティティを登録してから検索
      graphRepository.createEntity({
        name: "TypeScript",
        entityType: "technology",
        createdAt: new Date().toISOString(),
      });
      const result = service.searchEntities({ query: "TypeScript" });
      expect(result.query).toBe("TypeScript");
      expect(result.totalResults).toBeGreaterThanOrEqual(1);
    });

    it("should return empty result when graphRepository not provided", () => {
      const svcNoGraph = new KnowledgeService({ repository: ctx.repository });
      const result = svcNoGraph.searchEntities({ query: "TypeScript" });
      expect(result.totalResults).toBe(0);
      expect(result.entities).toHaveLength(0);
    });
  });

  // ── getEntityGraph ────────────────────────────────────────────

  describe("getEntityGraph", () => {
    it("should return undefined when graphRepository not provided", () => {
      const svcNoGraph = new KnowledgeService({ repository: ctx.repository });
      const result = svcNoGraph.getEntityGraph({ entityId: 1 });
      expect(result).toBeUndefined();
    });

    it("should return undefined for non-existent entity", () => {
      const result = service.getEntityGraph({ entityId: 99999 });
      expect(result).toBeUndefined();
    });

    it("should return entity graph by id", () => {
      const entityId = graphRepository.createEntity({
        name: "React",
        entityType: "technology",
        createdAt: new Date().toISOString(),
      });
      const result = service.getEntityGraph({ entityId });
      expect(result).not.toBeUndefined();
      expect(result!.name).toBe("react");
    });

    it("should return entity graph by name", () => {
      graphRepository.createEntity({
        name: "Vue",
        entityType: "technology",
        createdAt: new Date().toISOString(),
      });
      const result = service.getEntityGraph({ entityName: "Vue" });
      expect(result).not.toBeUndefined();
    });

    it("should return undefined when neither entityId nor entityName provided", () => {
      const result = service.getEntityGraph({});
      expect(result).toBeUndefined();
    });
  });

  // ── reportExtractionError ─────────────────────────────────────

  describe("reportExtractionError", () => {
    it("should create feedback record", () => {
      const result = service.reportExtractionError({
        entityName: "TestEntity",
        errorType: "false_positive",
      });
      expect(result.message).toBe("Feedback recorded successfully");
      expect(result.feedback).toHaveProperty("id");
      expect(result.feedback.entityName).toBe("TestEntity");
      expect(result.feedback.errorType).toBe("false_positive");
    });

    it("should throw when feedbackRepository not provided", () => {
      const svcNoFeedback = new KnowledgeService({ repository: ctx.repository });
      expect(() =>
        svcNoFeedback.reportExtractionError({
          entityName: "TestEntity",
          errorType: "false_positive",
        }),
      ).toThrow("Feedback system is not available.");
    });

    it("should accept all error types", () => {
      const errorTypes = ["false_positive", "wrong_type", "missed_entity"] as const;
      for (const errorType of errorTypes) {
        const result = service.reportExtractionError({
          entityName: `Entity_${errorType}`,
          errorType,
        });
        expect(result.feedback.errorType).toBe(errorType);
      }
    });
  });
});
