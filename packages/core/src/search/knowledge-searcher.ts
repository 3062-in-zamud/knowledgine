import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import type { LLMProvider } from "../llm/types.js";
import { SemanticSearcher } from "./semantic-searcher.js";
import { HybridSearcher } from "./hybrid-searcher.js";
import { ReasoningReranker } from "./reasoning-reranker.js";
import type { RerankerWeights } from "./reasoning-reranker.js";

export interface SearchOptions {
  query?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  mode?: "keyword" | "semantic" | "hybrid";
  rerank?: boolean;
  rerankWeights?: RerankerWeights;
  includeDeprecated?: boolean;
  agentic?: boolean;
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
  private reranker: ReasoningReranker;
  private agenticReranker: ReasoningReranker;

  constructor(
    private repository: KnowledgeRepository,
    embeddingProvider?: EmbeddingProvider,
    hybridAlpha: number = 0.3,
    llmProvider?: LLMProvider,
  ) {
    if (embeddingProvider) {
      this.semanticSearcher = new SemanticSearcher(repository, embeddingProvider);
      this.hybridSearcher = new HybridSearcher(repository, embeddingProvider, hybridAlpha);
    }
    this.reranker = new ReasoningReranker(undefined, repository);
    this.agenticReranker = new ReasoningReranker(llmProvider, repository);
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const {
      query,
      limit = 50,
      mode = "keyword",
      rerank = false,
      rerankWeights,
      includeDeprecated = false,
      agentic = false,
    } = options;

    if (!query) {
      return [];
    }

    let results: SearchResult[];

    if (mode === "semantic" && this.semanticSearcher) {
      results = await this.semanticSearcher.search(query, limit);
    } else if (mode === "hybrid" && this.hybridSearcher) {
      results = await this.hybridSearcher.search(query, limit);
    } else {
      // Fall back to keyword search when semantic/hybrid requested but provider unavailable
      const fellBack =
        mode !== "keyword" &&
        ((mode === "semantic" && !this.semanticSearcher) ||
          (mode === "hybrid" && !this.hybridSearcher));

      // keyword mode (デフォルト) — FTS5
      const rows = this.repository.searchNotesWithRank(query, limit, includeDeprecated);

      if (rows.length === 0) {
        return [];
      }

      // FTSスコアをmin-max正規化
      const rawRanks = rows.map((r) => Math.abs(r.rank));
      const minRank = Math.min(...rawRanks);
      const maxRank = Math.max(...rawRanks);
      const range = maxRank - minRank;

      const now = Date.now();
      results = rows.map(({ note, rank }) => {
        const normalized = range > 0 ? (Math.abs(rank) - minRank) / range : 1.0;
        let score = 1 - normalized;

        // valid_from スコアボーナス: 新しいほど高スコア (最大+0.5)
        // yearsSinceNow が小さいほど (= より新しい) ボーナスが大きい
        const validFrom = note.valid_from ?? note.created_at;
        if (validFrom) {
          const ageMs = now - new Date(validFrom).getTime();
          const yearsSinceNow = ageMs / (1000 * 60 * 60 * 24 * 365);
          // 新しさボーナス: 経過年数が少ないほど高い (上限0.5、最低0)
          score += Math.max(0, 0.5 - yearsSinceNow * 0.1);
        }

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

    // agentic モード: LLMベース ReasoningReranker を使用
    if (agentic && results.length > 0) {
      const reranked = await this.agenticReranker.rerank(query, results);
      return reranked.map((r) => ({
        note: r.note,
        score: r.score,
        matchReason: [...r.matchReason, ...(r.reasoning ? [`LLM推論: ${r.reasoning}`] : [])],
        fellBack: results.find((orig) => orig.note.id === r.note.id)?.fellBack,
      }));
    }

    if (rerank && results.length > 0) {
      const currentReranker = rerankWeights
        ? new ReasoningReranker(undefined, this.repository, rerankWeights)
        : this.reranker;

      const rerankInputs = results.map((r) => ({
        note: r.note,
        baseScore: r.score,
        matchReason: r.matchReason,
      }));
      const reranked = await currentReranker.rerankLegacy(rerankInputs, { query });
      return reranked.map((r) => ({
        note: r.note,
        score: r.finalScore,
        matchReason: r.matchReason,
        fellBack: results.find((orig) => orig.note.id === r.note.id)?.fellBack,
      }));
    }

    return results;
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
