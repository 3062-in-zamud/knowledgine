import type { KnowledgeNote, KnowledgeRepository } from "../storage/knowledge-repository.js";
import type { GraphRepository } from "../graph/graph-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import type { LLMProvider } from "../llm/types.js";
import type { EntityWithGraph } from "../types.js";
import type { SearchOptions } from "./knowledge-searcher.js";
import type { SearchResult } from "./knowledge-searcher.js";
import { SemanticSearcher } from "./semantic-searcher.js";
import { HybridSearcher } from "./hybrid-searcher.js";
import { ReasoningReranker } from "./reasoning-reranker.js";
import { classifyQuery, getWeightsForQueryType } from "./query-classifier.js";

export interface OrchestratedResult {
  note: KnowledgeNote;
  score: number;
  layerScores: Record<string, number>;
  matchReason: string[];
  graphContext?: EntityWithGraph[];
}

export interface QueryOrchestratorConfig {
  defaultWeights?: Record<string, number>;
  maxResults?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_TIMEOUT_MS = 5000;
const GRAPH_CANDIDATE_LIMIT = 20;

/**
 * Vector(FTS5/semantic/hybrid) + Graph(entity traversal) + Agentic(ReasoningReranker)
 * の3層統合検索エンジン。
 */
export class QueryOrchestrator {
  private semanticSearcher?: SemanticSearcher;
  private hybridSearcher?: HybridSearcher;
  private agenticReranker: ReasoningReranker;
  private maxResults: number;
  private timeoutMs: number;

  constructor(
    private repository: KnowledgeRepository,
    private graphRepository: GraphRepository,
    embeddingProvider?: EmbeddingProvider,
    llmProvider?: LLMProvider,
    config?: QueryOrchestratorConfig,
  ) {
    if (embeddingProvider) {
      this.semanticSearcher = new SemanticSearcher(repository, embeddingProvider);
      this.hybridSearcher = new HybridSearcher(repository, embeddingProvider);
    }
    this.agenticReranker = new ReasoningReranker(llmProvider, repository);
    this.maxResults = config?.maxResults ?? DEFAULT_MAX_RESULTS;
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async query(options: SearchOptions): Promise<OrchestratedResult[]> {
    const { query, limit = this.maxResults, mode = "keyword", includeDeprecated = false } = options;

    if (!query) {
      return [];
    }

    const queryType = classifyQuery(query);
    const weights = getWeightsForQueryType(queryType);

    // Step 1: Vector層 — FTS5 / semantic / hybrid
    const vectorResults = await this.fetchVectorResults(query, limit, mode, includeDeprecated);

    // Step 2: Graph層 — Vector層の上位候補から関連エンティティを取得し追加候補を生成
    const graphEnhanced = await this.fetchGraphResults(vectorResults, query, weights.graph);

    // Step 3: Agentic層 — LLMによるリランキング（タイムアウト制御あり）
    const mergedResults = this.mergeLayerResults(vectorResults, graphEnhanced, weights);

    const finalResults = await this.applyAgenticLayer(query, mergedResults, weights.agentic);

    return finalResults.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private async fetchVectorResults(
    query: string,
    limit: number,
    mode: string,
    includeDeprecated: boolean,
  ): Promise<SearchResult[]> {
    try {
      if (mode === "semantic" && this.semanticSearcher) {
        return await this.semanticSearcher.search(query, limit);
      }
      if (mode === "hybrid" && this.hybridSearcher) {
        return await this.hybridSearcher.search(query, limit);
      }
    } catch {
      // フォールバック: FTS5
    }

    // FTS5 keyword検索
    const rows = this.repository.searchNotesWithRank(query, limit, includeDeprecated);
    if (rows.length === 0) {
      return [];
    }

    const rawRanks = rows.map((r) => Math.abs(r.rank));
    const minRank = Math.min(...rawRanks);
    const maxRank = Math.max(...rawRanks);
    const range = maxRank - minRank;

    return rows.map(({ note, rank }) => {
      const normalized = range > 0 ? (Math.abs(rank) - minRank) / range : 1.0;
      const score = 1 - normalized;
      return {
        note,
        score,
        matchReason: [`キーワード一致: "${query}"`],
      };
    });
  }

  private async fetchGraphResults(
    vectorResults: SearchResult[],
    _query: string,
    graphWeight: number,
  ): Promise<
    Map<number, { score: number; graphContext: EntityWithGraph[]; matchReason: string[] }>
  > {
    const graphResultMap = new Map<
      number,
      { score: number; graphContext: EntityWithGraph[]; matchReason: string[] }
    >();

    if (graphWeight === 0 || vectorResults.length === 0) {
      return graphResultMap;
    }

    // Vector層の上位20件を使ってGraph探索
    const topCandidates = vectorResults.slice(0, GRAPH_CANDIDATE_LIMIT);
    const additionalNoteIds = new Set(topCandidates.map((r) => r.note.id));

    for (const result of topCandidates) {
      const noteId = result.note.id;
      const linkedEntities = this.graphRepository.getLinkedEntities(noteId);

      if (linkedEntities.length === 0) continue;

      // 関連エンティティを取得してgraphContextとして付与
      const entityGraphs: EntityWithGraph[] = [];
      const linkedNoteIds = new Set<number>();

      for (const entity of linkedEntities) {
        const entityGraph = this.graphRepository.getEntityWithGraph(entity.id!);
        if (entityGraph) {
          entityGraphs.push(entityGraph);
          // 関連エンティティに紐づく他のノートを候補に追加
          for (const ln of entityGraph.linkedNotes) {
            if (!additionalNoteIds.has(ln.noteId)) {
              linkedNoteIds.add(ln.noteId);
              additionalNoteIds.add(ln.noteId);
            }
          }
        }
      }

      // 既存vectorResultに対してgraphContextを付与
      if (entityGraphs.length > 0) {
        const graphScore = this.calculateGraphScore(linkedEntities.length, entityGraphs);
        graphResultMap.set(noteId, {
          score: graphScore,
          graphContext: entityGraphs,
          matchReason: [`グラフ関連エンティティ数: ${linkedEntities.length}`],
        });
      }

      // 関連ノートを新規候補として追加
      for (const additionalNoteId of linkedNoteIds) {
        if (!graphResultMap.has(additionalNoteId)) {
          const note = this.repository.getNoteById(additionalNoteId);
          if (note) {
            const graphScore = 0.3; // 間接的な関連のスコア
            graphResultMap.set(additionalNoteId, {
              score: graphScore,
              graphContext: entityGraphs,
              matchReason: [`グラフ経由の関連ノート (entity: ${linkedEntities[0]?.name ?? ""})`],
            });
          }
        }
      }
    }

    return graphResultMap;
  }

  private calculateGraphScore(entityCount: number, entityGraphs: EntityWithGraph[]): number {
    // エンティティ数と関係の強度に基づいてスコアを計算
    const entityBonus = Math.min(entityCount * 0.1, 0.5);
    const relationStrength = entityGraphs.reduce((sum, eg) => {
      const outgoing = eg.outgoingRelations.reduce((s, r) => s + (r.strength ?? 1.0), 0);
      const incoming = eg.incomingRelations.reduce((s, r) => s + (r.strength ?? 1.0), 0);
      const count = eg.outgoingRelations.length + eg.incomingRelations.length;
      return sum + (count > 0 ? (outgoing + incoming) / count : 0);
    }, 0);
    const avgRelationStrength =
      entityGraphs.length > 0 ? relationStrength / entityGraphs.length : 0;
    return Math.min(entityBonus + avgRelationStrength * 0.3, 1.0);
  }

  private mergeLayerResults(
    vectorResults: SearchResult[],
    graphResultMap: Map<
      number,
      { score: number; graphContext: EntityWithGraph[]; matchReason: string[] }
    >,
    weights: { vector: number; graph: number; agentic: number },
  ): OrchestratedResult[] {
    // vectorResultsを基本候補として使用
    const noteMap = new Map<number, OrchestratedResult>();

    for (const vr of vectorResults) {
      const graphData = graphResultMap.get(vr.note.id);
      const vectorScore = vr.score;
      const graphScore = graphData?.score ?? 0;
      // agenticは後で上書き、ここでは仮で0
      const agenticScore = 0;

      const finalScore =
        weights.vector * vectorScore + weights.graph * graphScore + weights.agentic * agenticScore;

      noteMap.set(vr.note.id, {
        note: vr.note,
        score: finalScore,
        layerScores: {
          vector: vectorScore,
          graph: graphScore,
          agentic: agenticScore,
        },
        matchReason: [...vr.matchReason, ...(graphData?.matchReason ?? [])],
        graphContext: graphData?.graphContext,
      });
    }

    // graphResultMapに含まれる新規ノート（vectorになかったもの）を追加
    for (const [noteId, graphData] of graphResultMap) {
      if (!noteMap.has(noteId)) {
        const note = this.repository.getNoteById(noteId);
        if (!note) continue;

        const graphScore = graphData.score;
        const finalScore = weights.graph * graphScore;

        noteMap.set(noteId, {
          note,
          score: finalScore,
          layerScores: {
            vector: 0,
            graph: graphScore,
            agentic: 0,
          },
          matchReason: graphData.matchReason,
          graphContext: graphData.graphContext,
        });
      }
    }

    return Array.from(noteMap.values());
  }

  private async applyAgenticLayer(
    query: string,
    candidates: OrchestratedResult[],
    agenticWeight: number,
  ): Promise<OrchestratedResult[]> {
    if (candidates.length === 0 || agenticWeight === 0) {
      return candidates;
    }

    // SearchResult形式に変換してReasoningRerankerに渡す
    const searchResults: SearchResult[] = candidates.map((c) => ({
      note: c.note,
      score: c.score,
      matchReason: c.matchReason,
    }));

    // タイムアウト制御: LLMが遅延した場合はVector+Graphのみで返却
    const rerankedPromise = this.agenticReranker.rerank(query, searchResults);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), this.timeoutMs),
    );

    const reranked = await Promise.race([rerankedPromise, timeoutPromise]);

    if (reranked === null) {
      // タイムアウト: agenticScoreなしで返却
      return candidates;
    }

    // rerankedのスコアをagenticScoreとして候補にマージ
    const rerankedMap = new Map(reranked.map((r) => [r.note.id, r]));

    return candidates.map((candidate) => {
      const rerankedResult = rerankedMap.get(candidate.note.id);
      if (!rerankedResult) {
        return candidate;
      }

      const agenticScore = rerankedResult.score;
      const vectorScore = candidate.layerScores["vector"] ?? 0;
      const graphScore = candidate.layerScores["graph"] ?? 0;

      // mergeLayerResultsで計算済みのvector+graphスコアにagenticを加算
      // finalScore = w_v * vectorScore + w_g * graphScore + w_a * agenticScore
      // candidateのscoreはすでに w_v * vectorScore + w_g * graphScore (agentic=0で計算済み)
      // なのでagenticScore分を追加する
      const finalScore = candidate.score + agenticWeight * agenticScore;

      const agenticReasons = rerankedResult.reasoning
        ? [`LLM推論: ${rerankedResult.reasoning}`]
        : [];

      return {
        ...candidate,
        score: finalScore,
        layerScores: {
          vector: vectorScore,
          graph: graphScore,
          agentic: agenticScore,
        },
        matchReason: [...candidate.matchReason, ...agenticReasons],
      };
    });
  }
}
