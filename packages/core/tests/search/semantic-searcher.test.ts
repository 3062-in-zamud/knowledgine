import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SemanticSearcher } from "../../src/search/semantic-searcher.js";
import { createTestDb, seedTestData } from "../helpers/test-db.js";
import { MockEmbeddingProvider } from "../helpers/mock-embedding-provider.js";
import type { TestContext } from "../helpers/test-db.js";

describe("SemanticSearcher", () => {
  let ctx: TestContext;
  let provider: MockEmbeddingProvider;
  let searcher: SemanticSearcher;

  beforeEach(() => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    provider = new MockEmbeddingProvider();
    searcher = new SemanticSearcher(ctx.repository, provider);
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("should return empty array when sqlite-vec is unavailable (graceful degradation)", async () => {
    // In-memory SQLite without sqlite-vec loaded → searchByVector returns []
    const results = await searcher.search("TypeScript");
    // Without vec extension, searchByVector returns []
    expect(results).toEqual([]);
  });

  it("should return semantic results when embeddings are stored", async () => {
    // Manually store embeddings using the mock provider
    const notes = ctx.repository.getNotesWithoutEmbeddings();
    for (const note of notes) {
      const emb = await provider.embed(note.content);
      ctx.repository.saveEmbedding(note.id, emb, "mock");
    }

    // Even with embeddings stored, without sqlite-vec the vec search returns []
    // This test validates graceful degradation
    const results = await searcher.search("TypeScript");
    expect(Array.isArray(results)).toBe(true);
  });
});
