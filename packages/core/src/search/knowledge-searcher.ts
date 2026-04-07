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
import { CHANGELOG_PATTERN, CHANGELOG_DISCOUNT, applyScoreDiscounts } from "./score-adjustments.js";

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

export type { FallbackInfo } from "../types.js";
import type { FallbackInfo } from "../types.js";

export interface SearchResult {
  note: KnowledgeNote | KnowledgeNoteSummary;
  score: number;
  matchReason: string[];
  snippet?: string;
  fellBack?: boolean;
  fallbackInfo?: FallbackInfo;
}

export class KnowledgeSearcher {
  private semanticSearcher?: SemanticSearcher;
  private hybridSearcher?: HybridSearcher;
  private reranker: ReasoningReranker;
  private agenticReranker: ReasoningReranker;
  private orchestrator?: QueryOrchestrator;
  private graphRepository?: GraphRepository;
  readonly embeddingModelMismatchWarning?: string;

  constructor(
    private repository: KnowledgeRepository,
    embeddingProvider?: EmbeddingProvider,
    hybridAlpha: number = 0.3,
    llmProvider?: LLMProvider,
    graphRepository?: GraphRepository,
  ) {
    this.graphRepository = graphRepository;

    // ミスマッチ検出: DBに保存されているモデル名と現在のDEFAULT_MODEL_NAMEを比較
    const storedModels = repository.getEmbeddingModelNames();
    if (storedModels.length > 0 && storedModels.some((m) => m !== DEFAULT_MODEL_NAME)) {
      const oldModels = storedModels.filter((m) => m !== DEFAULT_MODEL_NAME);
      this.embeddingModelMismatchWarning =
        `embeddingモデルが変更されています (${oldModels.join(", ")} → ${DEFAULT_MODEL_NAME})` +
        ` — \`knowledgine upgrade --reindex\` を実行してembeddingを再生成してください。`;
    }

    if (embeddingProvider) {
      this.semanticSearcher = new SemanticSearcher(repository, embeddingProvider);
      const modelFamily =
        embeddingProvider.modelFamily ?? MODEL_REGISTRY[DEFAULT_MODEL_NAME]?.family ?? "bert";
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
      // searchByVector already fetches limit*3 internally for confidence filtering,
      // so no additional expansion needed here. Apply discounts → re-rank → slice.
      const expanded = await this.semanticSearcher.search(query, limit);
      const discounted = expanded.map((r) => ({
        ...r,
        score: applyScoreDiscounts(r.score, {
          filePath: r.note.file_path,
          confidence: r.note.confidence,
        }),
      }));
      discounted.sort((a, b) => b.score - a.score);
      results = discounted.slice(0, limit);
    } else if (mode === "hybrid" && this.hybridSearcher) {
      results = await this.hybridSearcher.search(query, limit);
    } else {
      // Fall back to keyword search when semantic/hybrid requested but provider unavailable
      const fellBack =
        mode !== "keyword" &&
        ((mode === "semantic" && !this.semanticSearcher) ||
          (mode === "hybrid" && !this.hybridSearcher));

      // BM25 rank はマイナス値で、より負の値ほど良いスコア
      // CHANGELOG / CHANGES / HISTORY は 70% discount: rank を 0.3 倍して 0 に近づける（悪くする）
      // newness bonus: 新しいノートの rank をより負にして良くする（乗算ボーナス）
      // CHANGELOG_PATTERN and CHANGELOG_DISCOUNT imported from score-adjustments.ts

      // keyword mode (デフォルト) — FTS5 + snippet
      const rows = this.repository.searchNotesWithSnippet(
        query,
        limit,
        includeDeprecated,
        dateFrom,
        dateTo,
      );

      // AND→OR fallback: if AND results are insufficient (< 3), supplement with OR
      // When rows.length === 0: full OR fallback (original behavior)
      // When 0 < rows.length < 3: merge AND results with OR-only results (0.8x discount)
      let orSupplementResults: SearchResult[] | undefined;

      if (rows.length < 3) {
        const terms = query.trim().split(/\s+/);
        if (terms.length > 1 && !query.includes(" OR ")) {
          const orQuery = terms.join(" OR ");
          const orRows = this.repository.searchNotesWithSnippet(
            orQuery,
            limit,
            includeDeprecated,
            dateFrom,
            dateTo,
          );

          if (orRows.length > 0) {
            const orAdjustedRanks = orRows.map(({ note, rank }) => {
              let adjusted = rank;
              const validFrom = note.valid_from ?? note.created_at;
              if (validFrom) {
                const yearsSinceNow =
                  (Date.now() - new Date(validFrom).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
                if (Number.isFinite(yearsSinceNow)) {
                  const boost = 1 + Math.min(0.3, Math.max(0, 0.3 - yearsSinceNow * 0.06));
                  adjusted = adjusted * boost;
                }
              }
              if (CHANGELOG_PATTERN.test(basename(note.file_path))) {
                adjusted = adjusted * CHANGELOG_DISCOUNT;
              }
              return adjusted;
            });

            const orMinRank = Math.min(...orAdjustedRanks);
            const orMaxRank = Math.max(...orAdjustedRanks);
            const orRange = orMaxRank - orMinRank;

            if (rows.length === 0) {
              // Original behavior: OR results only (no AND results to compare)
              results = orRows.map(({ note }, i) => {
                const normalized = orRange > 0 ? (orAdjustedRanks[i] - orMinRank) / orRange : 0;
                const score = 1 - normalized;
                return {
                  note,
                  score,
                  matchReason: [`キーワード一致 (OR): "${orQuery}"`],
                  fellBack: true,
                  fallbackInfo: {
                    reason: `No results for AND query "${query}" — expanded to OR`,
                    modeUsed: "keyword" as const,
                    originalMode: "keyword",
                  },
                };
              });

              results.sort((a, b) => b.score - a.score);

              // Skip normal keyword processing, jump to reranking
              if (agentic && results.length > 0) {
                const reranked = await this.agenticReranker.rerank(query, results);
                return reranked.map((r) => ({
                  note: r.note,
                  score: r.score,
                  matchReason: [
                    ...r.matchReason,
                    ...(r.reasoning ? [`LLM推論: ${r.reasoning}`] : []),
                  ],
                  fellBack: true,
                  fallbackInfo: results.find((orig) => orig.note.id === r.note.id)?.fallbackInfo,
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
                  fellBack: true,
                  fallbackInfo: results.find((orig) => orig.note.id === r.note.id)?.fallbackInfo,
                }));
              }

              return results;
            } else {
              // AND has 1-2 results: build OR-only supplement (deduped, 0.8x discount)
              const andNoteIds = new Set(rows.map((r) => r.note.id));
              const OR_DISCOUNT = 0.8;

              // Precompute noteId→index map to avoid O(n²) findIndex
              const orNoteIdToIdx = new Map<number, number>();
              for (let idx = 0; idx < orRows.length; idx++) {
                orNoteIdToIdx.set(orRows[idx].note.id, idx);
              }

              orSupplementResults = orRows
                .filter(({ note }) => !andNoteIds.has(note.id))
                .map(({ note }, _i) => {
                  const origIdx = orNoteIdToIdx.get(note.id)!;
                  const normalized =
                    orRange > 0 ? (orAdjustedRanks[origIdx] - orMinRank) / orRange : 0;
                  const score = (1 - normalized) * OR_DISCOUNT;
                  return {
                    note,
                    score,
                    matchReason: [`キーワード一致 (OR): "${orQuery}"`],
                    fellBack: true,
                    fallbackInfo: {
                      reason: `AND results insufficient (${rows.length}) — supplemented with OR`,
                      modeUsed: "keyword" as const,
                      originalMode: "keyword",
                    },
                  };
                });
            }
          }
        }

        if (rows.length === 0) {
          return [];
        }
      }

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

      results = rows.map(({ note, snippet }, i) => {
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
          snippet,
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

      // Entity-linked ranking boost (orchestrator-free path only)
      // The orchestrator already handles graph-based boosting
      if (this.graphRepository && results.length > 0) {
        try {
          const queryTerms = query
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 1);
          const boostedNoteIds = new Set<number>();

          for (const term of queryTerms) {
            const entities = this.graphRepository.searchEntities(term, 5);
            for (const entity of entities) {
              const linkedNotes = this.graphRepository.getLinkedNotes(entity.id);
              for (const link of linkedNotes) {
                boostedNoteIds.add(link.noteId);
              }
            }
          }

          if (boostedNoteIds.size > 0) {
            for (const result of results) {
              if (boostedNoteIds.has(result.note.id)) {
                result.score *= 1.2; // 20% boost for entity-linked notes
                result.matchReason.push("エンティティ連動ブースト");
              }
            }
            // Re-sort after boosting
            results.sort((a, b) => b.score - a.score);
          }
        } catch {
          // Entity boost is non-critical — silently continue
        }
      }

      // Append OR supplement results (when AND had 1-2 results)
      if (orSupplementResults && orSupplementResults.length > 0) {
        results.push(...orSupplementResults);
        results.sort((a, b) => b.score - a.score);
      }

      // Preserve the search({ limit }) contract after merging supplements
      if (results.length > limit) {
        results.splice(limit);
      }
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
