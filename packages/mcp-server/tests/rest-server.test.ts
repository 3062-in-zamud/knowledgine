import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KnowledgeService } from "@knowledgine/core";
import { createRestApp } from "../src/rest-server.js";

const mockStatsResult = {
  totalNotes: 100,
  totalPatterns: 50,
  totalLinks: 30,
  totalPairs: 10,
  patternsByType: { concept: 30, technique: 20 },
  embeddingStatus: { available: false, notesWithoutEmbeddings: null },
  graphStats: null,
};

const mockSearchResult = {
  query: "test",
  mode: "keyword" as const,
  actualMode: "keyword" as const,
  totalResults: 2,
  results: [
    {
      noteId: 1,
      filePath: "notes/typescript.md",
      title: "TypeScript Guide",
      score: 0.9,
      matchReason: ["keyword match"],
      createdAt: "2024-01-01T00:00:00Z",
    },
    {
      noteId: 2,
      filePath: "notes/javascript.md",
      title: "JavaScript Basics",
      score: 0.7,
      matchReason: ["keyword match"],
      createdAt: "2024-01-02T00:00:00Z",
    },
  ],
};

const mockSearchEntitiesResult = {
  query: "TypeScript",
  totalResults: 1,
  entities: [
    {
      id: 1,
      name: "TypeScript",
      entityType: "technology",
      description: "Typed superset of JavaScript",
      createdAt: "2024-01-01T00:00:00Z",
    },
  ],
};

const mockEntityGraph = {
  id: 1,
  name: "TypeScript",
  entityType: "technology",
  description: "Typed superset of JavaScript",
  createdAt: "2024-01-01T00:00:00Z",
  observations: [],
  relations: [],
};

const mockFindRelatedResult = {
  noteId: 1,
  relatedNotes: [
    {
      noteId: 2,
      filePath: "notes/javascript.md",
      title: "JavaScript Basics",
      score: 0.8,
      reasons: ["linked note"],
    },
  ],
  problemSolutionPairs: [],
  graphRelations: [],
};

const mockService = {
  getStats: vi.fn().mockReturnValue(mockStatsResult),
  search: vi.fn().mockResolvedValue(mockSearchResult),
  searchEntities: vi.fn().mockReturnValue(mockSearchEntitiesResult),
  getEntityGraph: vi.fn().mockReturnValue(mockEntityGraph),
  findRelated: vi.fn().mockResolvedValue(mockFindRelatedResult),
};

describe("REST API Server", () => {
  let app: ReturnType<typeof createRestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createRestApp(mockService as unknown as KnowledgeService, "0.2.1");
  });

  describe("GET /health", () => {
    it("should return 200 with ok, version, and notes count", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.version).toBe("0.2.1");
      expect(body.notes).toBe(100);
      expect(mockService.getStats).toHaveBeenCalledOnce();
    });
  });

  describe("GET /search", () => {
    it("should return 200 with search results and took_ms", async () => {
      const res = await app.request("/search?q=test");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.query).toBe("test");
      expect(body.totalResults).toBe(2);
      expect(body.results).toHaveLength(2);
      expect(body.took_ms).toBeGreaterThanOrEqual(0);
      expect(mockService.search).toHaveBeenCalledWith({
        query: "test",
        limit: 20,
        mode: "keyword",
      });
    });

    it("should return 400 when q parameter is missing", async () => {
      const res = await app.request("/search");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("q parameter is required");
    });

    it("should accept custom mode and limit parameters", async () => {
      const res = await app.request("/search?q=typescript&mode=semantic&limit=5");
      expect(res.status).toBe(200);
      expect(mockService.search).toHaveBeenCalledWith({
        query: "typescript",
        limit: 5,
        mode: "semantic",
      });
    });

    it("should return 400 for invalid limit", async () => {
      const res = await app.request("/search?q=test&limit=abc");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid limit");
    });

    it("should return 400 for limit less than 1", async () => {
      const res = await app.request("/search?q=test&limit=0");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid limit");
    });
  });

  describe("GET /stats", () => {
    it("should return 200 with stats result", async () => {
      const res = await app.request("/stats");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalNotes).toBe(100);
      expect(body.totalPatterns).toBe(50);
      expect(body.totalLinks).toBe(30);
      expect(mockService.getStats).toHaveBeenCalledOnce();
    });
  });

  describe("GET /entities", () => {
    it("should return 200 with entity search results", async () => {
      const res = await app.request("/entities?q=TypeScript");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.entities).toHaveLength(1);
      expect(body.entities[0].name).toBe("TypeScript");
      expect(mockService.searchEntities).toHaveBeenCalledWith({
        query: "TypeScript",
        limit: 20,
      });
    });

    it("should return empty query when q is not provided", async () => {
      const res = await app.request("/entities");
      expect(res.status).toBe(200);
      expect(mockService.searchEntities).toHaveBeenCalledWith({
        query: "",
        limit: 20,
      });
    });
  });

  describe("GET /entities/:name/graph", () => {
    it("should return 200 with entity graph for existing entity", async () => {
      const res = await app.request("/entities/TypeScript/graph");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("TypeScript");
      expect(mockService.getEntityGraph).toHaveBeenCalledWith({
        entityName: "TypeScript",
      });
    });

    it("should return 404 for non-existent entity", async () => {
      mockService.getEntityGraph.mockReturnValueOnce(undefined);
      const res = await app.request("/entities/nonexistent/graph");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Entity not found");
    });

    it("should decode URL-encoded entity names", async () => {
      const res = await app.request("/entities/Type%20Script/graph");
      expect(res.status).toBe(200);
      expect(mockService.getEntityGraph).toHaveBeenCalledWith({
        entityName: "Type Script",
      });
    });
  });

  describe("GET /related/:noteId", () => {
    it("should return 200 with related notes", async () => {
      const res = await app.request("/related/1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.noteId).toBe(1);
      expect(body.relatedNotes).toHaveLength(1);
      expect(mockService.findRelated).toHaveBeenCalledWith({
        noteId: 1,
        limit: 5,
      });
    });

    it("should return 400 for non-numeric noteId", async () => {
      const res = await app.request("/related/abc");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid noteId");
    });

    it("should accept custom limit parameter", async () => {
      const res = await app.request("/related/1?limit=10");
      expect(res.status).toBe(200);
      expect(mockService.findRelated).toHaveBeenCalledWith({
        noteId: 1,
        limit: 10,
      });
    });
  });
});
