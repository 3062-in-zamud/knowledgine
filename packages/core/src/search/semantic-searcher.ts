import type {
  KnowledgeRepository,
  KnowledgeNote,
  KnowledgeNoteSummary,
} from "../storage/knowledge-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";

export interface SemanticSearchResult {
  note: KnowledgeNote | KnowledgeNoteSummary;
  score: number;
  matchReason: string[];
}

export class SemanticSearcher {
  constructor(
    private repository: KnowledgeRepository,
    private embeddingProvider: EmbeddingProvider,
  ) {}

  async search(query: string, limit: number = 20): Promise<SemanticSearchResult[]> {
    const vectorStats = this.repository.getVectorIndexStats();
    if (vectorStats.missingVectorRows > 0) {
      this.repository.syncMissingVectorsFromEmbeddings();
    }

    const queryEmbedding = await this.embeddingProvider.embedQuery(query);
    const vecResults = this.repository.searchByVector(queryEmbedding, limit);

    if (vecResults.length === 0) {
      return [];
    }

    // N+1解消: IDリストを先に集めてバッチ取得
    const noteIds = vecResults.map(({ note_id }) => note_id);
    const notes = this.repository.getNotesSummaryByIds(noteIds);
    const noteMap = new Map(notes.map((n) => [n.id, n]));

    const results: SemanticSearchResult[] = [];
    for (const { note_id, distance } of vecResults) {
      const note = noteMap.get(note_id);
      if (!note) continue;

      // sqlite-vec vec0 returns L2 distance on unit vectors.
      // For L2-normalized embeddings: cosine_similarity = 1 - L2_distance² / 2
      // This gives a proper 0-1 range that separates similar vs dissimilar results.
      const score = Math.max(0, 1 - (distance * distance) / 2);

      results.push({
        note,
        score,
        matchReason: [`セマンティック類似度: ${(score * 100).toFixed(1)}%`],
      });
    }

    return results;
  }
}
