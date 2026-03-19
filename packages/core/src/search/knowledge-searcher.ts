import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";

export interface SearchOptions {
  query?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface SearchResult {
  note: KnowledgeNote;
  score: number;
  matchReason: string[];
}

export class KnowledgeSearcher {
  constructor(private repository: KnowledgeRepository) {}

  search(options: SearchOptions): SearchResult[] {
    const { query, limit = 50 } = options;

    // If there's a query, use FTS search
    if (query) {
      const notes = this.repository.searchNotes(query, limit);
      return notes.map((note) => ({
        note,
        score: 0.5, // FTS doesn't expose rank directly through repository
        matchReason: [`キーワード一致: "${query}"`],
      }));
    }

    // Without query, search is not supported through this interface
    // (would require direct DB access for non-FTS queries)
    return [];
  }

  searchByTag(tag: string, limit = 50): SearchResult[] {
    return this.search({ tags: [tag], limit });
  }

  searchRecent(days = 7, limit = 50): SearchResult[] {
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
