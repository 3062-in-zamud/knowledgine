import { describe, it, expect } from "vitest";
import type { KnowledgeService } from "@knowledgine/core";
import { createRestApp } from "../src/rest-server.js";

// Create a minimal mock service matching the pattern used in rest-server.test.ts
function createMockService(): KnowledgeService {
  return {
    getStats: () => ({
      totalNotes: 0,
      totalEntities: 0,
      totalRelations: 0,
      totalPatterns: 0,
    }),
    search: async () => ({
      query: "",
      mode: "keyword",
      actualMode: "keyword",
      modeUsed: "keyword",
      totalResults: 0,
      results: [],
    }),
    searchEntities: () => ({ query: "", entities: [] }),
    getEntityGraph: () => null,
    findRelated: async () => ({
      noteId: 0,
      relatedNotes: [],
      sharedEntities: [],
      problemSolutionPairs: [],
    }),
  } as unknown as KnowledgeService;
}

describe("REST API authentication", () => {
  it("returns 401 without auth token when auth is configured", async () => {
    const app = createRestApp(createMockService(), "test", undefined, undefined, {
      token: "test-secret",
    });
    const res = await app.request("/health");
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid auth token", async () => {
    const app = createRestApp(createMockService(), "test", undefined, undefined, {
      token: "test-secret",
    });
    const res = await app.request("/health", {
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 with invalid auth token", async () => {
    const app = createRestApp(createMockService(), "test", undefined, undefined, {
      token: "test-secret",
    });
    const res = await app.request("/health", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("works without auth when not configured", async () => {
    const app = createRestApp(createMockService(), "test");
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});

describe("Rate limiting", () => {
  it("includes rate limit headers", async () => {
    const app = createRestApp(createMockService(), "test");
    const res = await app.request("/health");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });
});
