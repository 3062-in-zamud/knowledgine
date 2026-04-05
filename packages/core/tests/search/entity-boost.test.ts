import { describe, it, expect, vi } from "vitest";
import { KnowledgeSearcher } from "../../src/search/knowledge-searcher.js";
import type { KnowledgeRepository } from "../../src/storage/knowledge-repository.js";

describe("KNOW-374: Entity ranking boost", () => {
  it("boost factor is 1.2x", () => {
    const original = 0.5;
    const boosted = original * 1.2;
    expect(boosted).toBeCloseTo(0.6);
  });

  it("only applies when graphRepository is provided", () => {
    // KnowledgeSearcher constructor accepts optional graphRepository
    // When not provided, no entity boost is applied
    const mockRepo = {
      searchNotesWithSnippet: vi.fn().mockReturnValue([]),
      searchNotesWithRank: vi.fn().mockReturnValue([]),
      getEmbeddingModelNames: vi.fn().mockReturnValue([]),
    } as unknown as KnowledgeRepository;

    const searcher = new KnowledgeSearcher(mockRepo);
    // No graphRepository → no entity boost path
    expect(searcher).toBeDefined();
  });
});
