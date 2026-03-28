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
    const queryEmbedding = await this.embeddingProvider.embed(query);
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

      // sqlite-vec distance (0=identical, higher=less similar)
      // Normalize to 0-1 score where 1=most similar
      const score = Math.max(0, 1 / (1 + distance));

      results.push({
        note,
        score,
        matchReason: [`セマンティック類似度: ${(score * 100).toFixed(1)}%`],
      });
    }

    return results;
  }
}
