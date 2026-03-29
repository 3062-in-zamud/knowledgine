import { basename } from "path";
import type {
  KnowledgeRepository,
  KnowledgeNote,
  KnowledgeNoteSummary,
} from "../storage/knowledge-repository.js";
import type { GraphRepository } from "../graph/graph-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import type { LLMProvider } from "../llm/types.js";
import { SemanticSearcher } from "./semantic-searcher.js";
import { HybridSearcher } from "./hybrid-searcher.js";
import { ReasoningReranker } from "./reasoning-reranker.js";
import type { RerankerWeights } from "./reasoning-reranker.js";
import { QueryOrchestrator } from "./query-orchestrator.js";
import { MODEL_REGISTRY, DEFAULT_MODEL_NAME } from "../embedding/model-manager.js";

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
  note: KnowledgeNote | KnowledgeNoteSummary;
  score: number;
  matchReason: string[];
  fellBack?: boolean;
  fallbackInfo?: {
    reason: string;
    modeUsed: "keyword" | "semantic" | "hybrid";
    originalMode: string;
  };
}

export class KnowledgeSearcher {
  private semanticSearcher?: SemanticSearcher;
  private hybridSearcher?: HybridSearcher;
  private reranker: ReasoningReranker;
  private agenticReranker: ReasoningReranker;
  private orchestrator?: QueryOrchestrator;

  constructor(
    private repository: KnowledgeRepository,
    embeddingProvider?: EmbeddingProvider,
    hybridAlpha: number = 0.3,
    llmProvider?: LLMProvider,
    graphRepository?: GraphRepository,
  ) {
    if (embeddingProvider) {
      this.semanticSearcher = new SemanticSearcher(repository, embeddingProvider);
      const modelFamily = MODEL_REGISTRY[DEFAULT_MODEL_NAME]?.family ?? "bert";
      this.hybridSearcher = new HybridSearcher(
        repository,
        embeddingProvider,
        hybridAlpha,
        modelFamily,
      );
    }
    this.reranker = new ReasoningReranker(undefined, repository);
    this.agenticReranker = new ReasoningReranker(llmProvider, repository);

    // graphRepositoryが提供された場合はQueryOrchestratorを使用
    if (graphRepository) {
      this.orchestrator = new QueryOrchestrator(
        repository,
        graphRepository,
        embeddingProvider,
        llmProvider,
      );
    }
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { mode = "keyword" } = options;

    // Capability pre-check: detect if requested mode is available BEFORE orchestrator delegation
    const needsSemantic = mode === "semantic" || mode === "hybrid";
    const semanticAvailable = !!this.semanticSearcher;

    if (needsSemantic && !semanticAvailable && options.query) {
      // Fallback to keyword search with transparent notification
      const keywordOptions = { ...options, mode: "keyword" as const };
      const keywordResults = await this.search(keywordOptions);
      return keywordResults.map((r) => ({
        ...r,
        fellBack: true,
        fallbackInfo: {
          reason: "Embedding provider not available — semantic search requires embeddings",
          modeUsed: "keyword" as const,
          originalMode: mode,
        },
      }));
    }

    // orchestratorが利用可能な場合はQueryOrchestratorに委譲
    if (this.orchestrator && options.query) {
      const results = await this.orchestrator.query(options);
      return results.map((r) => ({
        note: r.note,
        score: r.score,
        matchReason: r.matchReason,
      }));
    }

    const {
      query,
      limit = 50,
      rerank = false,
      rerankWeights,
      includeDeprecated = false,
      agentic = false,
      dateFrom,
      dateTo,
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
      const rows = this.repository.searchNotesWithRank(
        query,
        limit,
        includeDeprecated,
        dateFrom,
        dateTo,
      );

      if (rows.length === 0) {
        return [];
      }

      // BM25 rank はマイナス値で、より負の値ほど良いスコア
      // CHANGELOG / CHANGES / HISTORY は 70% discount: rank を 0.3 倍して 0 に近づける（悪くする）
      // newness bonus: 新しいノートの rank をより負にして良くする（乗算ボーナス）
      const CHANGELOG_PATTERN = /^(CHANGELOG|CHANGES|HISTORY)\.(md|txt|rst)$/i;
      const CHANGELOG_DISCOUNT = 0.3;
      const adjustedRanks = rows.map(({ note, rank }) => {
        let adjusted = rank;

        // newness boost: 新しいノートの rank をより負に（係数 > 1 で乗算）
        const validFrom = note.valid_from ?? note.created_at;
        if (validFrom) {
          const yearsSinceNow =
            (Date.now() - new Date(validFrom).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
          if (!Number.isFinite(yearsSinceNow)) return adjusted; // skip NaN / Infinity dates (no boost)
          // boost factor: 最大 1.3x（新しいほど rank が大きくなる = より負に近い）
          // Math.min(0.3, ...) で未来日付によるブーストが 1.3x を超えないようクランプ
          const boost = 1 + Math.min(0.3, Math.max(0, 0.3 - yearsSinceNow * 0.06));
          adjusted = adjusted * boost; // rank はマイナスなので * boost でより負になる
        }

        // CHANGELOG discount: rank をより0に近づける（0.3倍）
        if (CHANGELOG_PATTERN.test(basename(note.file_path))) {
          adjusted = adjusted * CHANGELOG_DISCOUNT;
        }

        return adjusted;
      });

      // FTSスコアをmin-max正規化（より負の値ほど良い）
      // minRank = 最も負の値 = 最良スコア → normalized=0 → score=1.0
      // maxRank = 最も0に近い値 = 最悪スコア → normalized=1 → score=0
      const minRank = Math.min(...adjustedRanks);
      const maxRank = Math.max(...adjustedRanks);
      const range = maxRank - minRank;

      results = rows.map(({ note }, i) => {
        const normalized = range > 0 ? (adjustedRanks[i] - minRank) / range : 0;
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
          ...(fellBack
            ? {
                fallbackInfo: {
                  reason: `${mode} search unavailable — embeddings not found`,
                  modeUsed: "keyword" as const,
                  originalMode: mode,
                },
              }
            : {}),
        };
      });

      // newness bonus 等の事後スコア調整後に降順ソート
      results.sort((a, b) => b.score - a.score);
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
