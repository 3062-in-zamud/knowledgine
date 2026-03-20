import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";

export interface SemanticSearchResult {
  note: KnowledgeNote;
  score: number;
  matchReason: string[];
}

export class SemanticSearcher {
  constructor(
    private repository: KnowledgeRepository,
    private embeddingProvider: EmbeddingProvider,
  ) {}

  async search(query: string, limit: number = 20): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await this.embeddingProvider.embed(query);
    const vecResults = this.repository.searchByVector(queryEmbedding, limit);

    if (vecResults.length === 0) {
      return [];
    }

    const results: SemanticSearchResult[] = [];
    for (const { note_id, distance } of vecResults) {
      const note = this.repository.getNoteById(note_id);
      if (!note) continue;

      // コサイン距離 (0=同じ, 2=真逆) → スコア (1=同じ, -1=真逆)
      const score = 1 - distance;

      results.push({
        note,
        score,
        matchReason: [`セマンティック類似度: ${(score * 100).toFixed(1)}%`],
      });
    }

    return results;
  }
}
