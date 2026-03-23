import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import { SemanticSearcher } from "./semantic-searcher.js";
import { HybridSearcher } from "./hybrid-searcher.js";

export interface SearchOptions {
  query?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  mode?: "keyword" | "semantic" | "hybrid";
}

export interface SearchResult {
  note: KnowledgeNote;
  score: number;
  matchReason: string[];
  fellBack?: boolean;
}

export class KnowledgeSearcher {
  private semanticSearcher?: SemanticSearcher;
  private hybridSearcher?: HybridSearcher;

  constructor(
    private repository: KnowledgeRepository,
    embeddingProvider?: EmbeddingProvider,
    hybridAlpha: number = 0.3,
  ) {
    if (embeddingProvider) {
      this.semanticSearcher = new SemanticSearcher(repository, embeddingProvider);
      this.hybridSearcher = new HybridSearcher(repository, embeddingProvider, hybridAlpha);
    }
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, limit = 50, mode = "keyword" } = options;

    if (!query) {
      return [];
    }

    if (mode === "semantic" && this.semanticSearcher) {
      return this.semanticSearcher.search(query, limit);
    }

    if (mode === "hybrid" && this.hybridSearcher) {
      return this.hybridSearcher.search(query, limit);
    }

    // Fall back to keyword search when semantic/hybrid requested but provider unavailable
    const fellBack =
      mode !== "keyword" &&
      ((mode === "semantic" && !this.semanticSearcher) ||
        (mode === "hybrid" && !this.hybridSearcher));

    // keyword mode (デフォルト) — FTS5
    const rows = this.repository.searchNotesWithRank(query, limit);

    if (rows.length === 0) {
      return [];
    }

    // FTSスコアをmin-max正規化
    const rawRanks = rows.map((r) => Math.abs(r.rank));
    const minRank = Math.min(...rawRanks);
    const maxRank = Math.max(...rawRanks);
    const range = maxRank - minRank;

    return rows.map(({ note, rank }) => {
      const normalized = range > 0 ? (Math.abs(rank) - minRank) / range : 1.0;
      const score = 1 - normalized;
      const reasons: string[] = [`キーワード一致: "${query}"`];
      if (fellBack) {
        reasons.push(
          `Warning: ${mode} search is not available. Showing keyword results instead. Run 'knowledgine upgrade --semantic' to enable.`,
        );
      }
      return {
        note,
        score,
        matchReason: reasons,
        fellBack,
      };
    });
  }

  async searchByTag(tag: string, limit = 50): Promise<SearchResult[]> {
    return this.search({ tags: [tag], limit });
  }

  async searchRecent(days = 7, limit = 50): Promise<SearchResult[]> {
    const dateTo = new Date().toISOString();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    return this.search({
      dateFrom: dateFrom.toISOString(),
      dateTo,
      limit,
    });
  }

  getSearchStats(results: SearchResult[]): {
    total: number;
    avgScore: number;
  } {
    let totalScore = 0;
    for (const result of results) {
      totalScore += result.score;
    }

    return {
      total: results.length,
      avgScore: results.length > 0 ? totalScore / results.length : 0,
    };
  }
}
