import type { LLMProvider } from "../llm/types.js";
import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";
import type { SearchResult } from "./knowledge-searcher.js";

export interface RerankOptions {
  maxCandidates?: number; // default 20 (入力上限)
  maxResults?: number; // default 5 (出力上限)
}

export interface RerankedResult {
  note: KnowledgeNote;
  score: number;
  originalScore: number;
  matchReason: string[];
  reasoning?: string; // LLMによる判断理由（LLMなし時はundefined）
  axes: {
    temporal: number; // 0-1
    contextRelevance: number; // 0-1
    pspQuality: number; // 0-1
  };
}

// --- 内部型（後方互換のため旧型もエクスポート） ---

export interface RerankInput {
  note: KnowledgeNote;
  baseScore: number;
  matchReason: string[];
}

export interface AxisScores {
  temporal: number;
  context: number;
  psp: number;
}

export interface RerankResult {
  note: KnowledgeNote;
  baseScore: number;
  scores: AxisScores;
  finalScore: number;
  matchReason: string[];
}

export interface RerankerWeights {
  temporalWeight?: number; // default 0.2
  contextWeight?: number; // default 0.2
  pspWeight?: number; // default 0.1
}

// --- 内部実装ヘルパー ---

const TEMPORAL_BONUS_PER_YEAR = 0.1;
const DEPRECATED_PENALTY = -0.5;
const FINAL_SCORE_WEIGHTS = {
  temporal: 0.3,
  contextRelevance: 0.4,
  pspQuality: 0.3,
};

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Temporal軸スコア計算
 * - valid_fromの新しさボーナス: +0.1/年（基準0.5から加算）
 * - deprecated=1なら -0.5ペナルティ
 */
function scoreTemporalAxis(note: KnowledgeNote): number {
  if (note.deprecated === 1) {
    return clamp(0.5 + DEPRECATED_PENALTY);
  }

  const referenceDate = note.valid_from ?? note.updated_at ?? note.created_at;
  const ageMs = Date.now() - new Date(referenceDate).getTime();
  const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365);

  // 基準 0.5 から新しさに応じてボーナス（0以上の場合のみ）
  const bonus = Math.max(0, -ageYears) * TEMPORAL_BONUS_PER_YEAR;
  // 古い場合はボーナスなし（年数が正なのでbonusは0）、0.5をベースに経過年数で減衰
  const score = 0.5 + bonus - ageYears * TEMPORAL_BONUS_PER_YEAR;
  return clamp(score);
}

/**
 * PSP quality軸スコア計算
 * problem_solution_pairs の confidence 平均。PSPなしは0.5（中立）
 */
function scorePspQuality(noteId: number, repository: KnowledgeRepository): number {
  try {
    const pairs = repository.getProblemSolutionPairsByNoteId(noteId);
    if (pairs.length === 0) return 0.5;
    const avg = pairs.reduce((sum, p) => sum + p.confidence, 0) / pairs.length;
    return clamp(avg);
  } catch {
    return 0.5;
  }
}

/**
 * Context relevance軸スコア（heuristic: originalScoreの正規化）
 */
function normalizeScores(scores: number[]): number[] {
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  if (range === 0) return scores.map(() => 0.5);
  return scores.map((s) => (s - min) / range);
}

// --- LLMプロンプト構築 ---

interface LLMRankingItem {
  noteId: number;
  relevance: number;
  reasoning: string;
}

interface LLMRankingResponse {
  rankings: LLMRankingItem[];
}

function buildLLMPrompt(
  query: string,
  candidates: SearchResult[],
): { system: string; user: string } {
  const system = `You are a knowledge relevance judge. Given a search query and a list of knowledge notes, rank the notes by relevance to the query. Consider the semantic meaning, context, and practical utility of each note.

Return a JSON object with a "rankings" array. Each element must have:
- noteId: the note's id (integer)
- relevance: relevance score from 0.0 to 1.0 (float)
- reasoning: brief explanation of why this note is relevant or not (string)

Example output:
{
  "rankings": [
    {"noteId": 42, "relevance": 0.95, "reasoning": "Directly addresses the query with specific solution steps"},
    {"noteId": 7, "relevance": 0.60, "reasoning": "Related topic but lacks specifics about the query context"},
    {"noteId": 13, "relevance": 0.20, "reasoning": "Only tangentially related through shared tags"}
  ]
}`;

  const candidateLines = candidates
    .map((c) => {
      const preview = c.note.content.slice(0, 200).replace(/\n/g, " ");
      const fm = c.note.frontmatter_json ? JSON.parse(c.note.frontmatter_json) : {};
      const tags: string[] = Array.isArray(fm.tags) ? fm.tags : [];
      return JSON.stringify({
        id: c.note.id,
        title: c.note.title,
        content: preview,
        tags,
      });
    })
    .join("\n");

  const user = `Search query: "${query}"

Knowledge notes to rank:
${candidateLines}

Return only the JSON object with rankings for all ${candidates.length} notes listed above.`;

  return { system, user };
}

function parseLLMResponse(content: string): LLMRankingResponse | null {
  // 最初の { から最後の } を切り出す
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const raw = JSON.parse(content.slice(start, end + 1)) as unknown;
    if (typeof raw !== "object" || raw === null) return null;

    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj["rankings"])) return null;

    const rankings: LLMRankingItem[] = [];
    for (const item of obj["rankings"] as unknown[]) {
      if (typeof item !== "object" || item === null) return null;
      const r = item as Record<string, unknown>;
      if (
        typeof r["noteId"] !== "number" ||
        typeof r["relevance"] !== "number" ||
        typeof r["reasoning"] !== "string"
      ) {
        return null;
      }
      rankings.push({
        noteId: r["noteId"] as number,
        relevance: r["relevance"] as number,
        reasoning: r["reasoning"] as string,
      });
    }

    return { rankings };
  } catch {
    return null;
  }
}

// --- メインクラス ---

export class ReasoningReranker {
  constructor(
    private llmProvider: LLMProvider | undefined,
    private repository: KnowledgeRepository,
    // 後方互換: 旧コードが ReasoningReranker(repository, weights) で呼ぶ場合
    private _legacyWeights?: RerankerWeights,
  ) {}

  /**
   * 新API: LLMベースのリランキング
   */
  async rerank(
    query: string,
    candidates: SearchResult[],
    options?: RerankOptions,
  ): Promise<RerankedResult[]> {
    const maxCandidates = options?.maxCandidates ?? 20;
    const maxResults = options?.maxResults ?? 5;

    if (candidates.length === 0) return [];

    // maxCandidates に絞る（元スコア降順）
    const limited = candidates
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCandidates);

    // LLMに渡す上位 maxResults 件と残りを分ける
    const forLLM = limited.slice(0, maxResults);
    const _rest = limited.slice(maxResults);

    // heuristic軸スコアを全件計算
    const temporalScores = limited.map((c) => scoreTemporalAxis(c.note));
    const pspScores = limited.map((c) => scorePspQuality(c.note.id, this.repository));

    // LLMがいる場合: context relevanceをLLMに問う
    const llmScoreMap = new Map<number, number>();
    const llmReasoningMap = new Map<number, string>();

    if (this.llmProvider && forLLM.length > 0) {
      try {
        const { system, user } = buildLLMPrompt(query, forLLM);
        const result = await this.llmProvider.complete({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          responseFormat: "json",
          temperature: 0.0,
        });

        const parsed = parseLLMResponse(result.content);
        if (parsed) {
          for (const item of parsed.rankings) {
            llmScoreMap.set(item.noteId, clamp(item.relevance));
            llmReasoningMap.set(item.noteId, item.reasoning);
          }
        }
        // パース失敗の場合は llmScoreMap が空のまま → フォールバック
      } catch {
        // LLMエラー時はフォールバック
      }
    }

    const llmSucceeded = llmScoreMap.size > 0;

    // フォールバック時は originalScore を正規化して contextRelevance として使用
    const originalScores = limited.map((c) => c.score);
    const normalizedOriginal = normalizeScores(originalScores);

    // 最終スコア計算
    const results: RerankedResult[] = limited.map((candidate, i) => {
      const temporal = temporalScores[i];
      const pspQuality = pspScores[i];

      let contextRelevance: number;
      let reasoning: string | undefined;

      if (llmSucceeded) {
        // LLMスコアがある場合（上位maxResults件のみ）
        const llmScore = llmScoreMap.get(candidate.note.id);
        if (llmScore !== undefined) {
          contextRelevance = llmScore;
          reasoning = llmReasoningMap.get(candidate.note.id);
        } else {
          // LLMに渡されなかった残りの候補: originalScoreを正規化
          contextRelevance = normalizedOriginal[i];
          reasoning = undefined;
        }
      } else {
        // LLMなし or フォールバック: originalScoreを正規化
        contextRelevance = normalizedOriginal[i];
        reasoning = undefined;
      }

      const score =
        FINAL_SCORE_WEIGHTS.temporal * temporal +
        FINAL_SCORE_WEIGHTS.contextRelevance * contextRelevance +
        FINAL_SCORE_WEIGHTS.pspQuality * pspQuality;

      return {
        note: candidate.note,
        score,
        originalScore: candidate.score,
        matchReason: [...candidate.matchReason],
        reasoning,
        axes: {
          temporal,
          contextRelevance,
          pspQuality,
        },
      };
    });

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, maxResults);
  }

  /**
   * 旧API後方互換: RerankInput[] を受け取り RerankResult[] を返す
   * KnowledgeSearcher が既存実装で呼んでいる形式
   */
  async rerankLegacy(inputs: RerankInput[], options: { query: string }): Promise<RerankResult[]> {
    if (inputs.length === 0) return [];

    const queryTokens = tokenize(options.query);

    const legacyWeights = {
      temporalWeight: 0.2,
      contextWeight: 0.2,
      pspWeight: 0.1,
      ...this._legacyWeights,
    };

    const results: RerankResult[] = inputs.map((input) => {
      const temporal = scoreLegacyTemporalAxis(input.note);
      const context = scoreLegacyContextAxis(input.note, queryTokens);
      const psp = scoreLegacyPSPAxis(input.note, this.repository);

      const finalScore =
        input.baseScore +
        legacyWeights.temporalWeight * temporal +
        legacyWeights.contextWeight * context +
        legacyWeights.pspWeight * psp;

      const matchReason = [
        ...input.matchReason,
        `時系列(temporal): ${(temporal * 100).toFixed(1)}%`,
        `文脈(context): ${(context * 100).toFixed(1)}%`,
        `PSP: ${(psp * 100).toFixed(1)}%`,
      ];

      return {
        note: input.note,
        baseScore: input.baseScore,
        scores: { temporal, context, psp },
        finalScore,
        matchReason,
      };
    });

    results.sort((a, b) => b.finalScore - a.finalScore);
    return results;
  }
}

// --- 旧API用ヘルパー関数 ---

const TEMPORAL_HALF_LIFE_DAYS = 90;

function tokenize(query: string): string[] {
  if (!query) return [];
  return query
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter((t) => t.length > 1);
}

function extractTags(frontmatterJson: string | null): string[] {
  if (!frontmatterJson) return [];
  try {
    const fm = JSON.parse(frontmatterJson) as Record<string, unknown>;
    const tags = fm["tags"];
    if (Array.isArray(tags)) return tags.map(String);
    if (typeof tags === "string") return [tags];
    return [];
  } catch {
    return [];
  }
}

function scoreLegacyTemporalAxis(note: KnowledgeNote): number {
  const referenceDate = note.updated_at ?? note.created_at;
  const ageMs = Date.now() - new Date(referenceDate).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const lambda = Math.LN2 / TEMPORAL_HALF_LIFE_DAYS;
  return Math.exp(-lambda * Math.max(0, ageDays));
}

function scoreLegacyContextAxis(note: KnowledgeNote, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0.5;
  const tags = extractTags(note.frontmatter_json);
  if (tags.length === 0) return 0.3;
  const matchCount = queryTokens.filter((token) =>
    tags.some((tag) => tag.toLowerCase().includes(token) || token.includes(tag.toLowerCase())),
  ).length;
  return matchCount / queryTokens.length;
}

function scoreLegacyPSPAxis(note: KnowledgeNote, repository: KnowledgeRepository): number {
  try {
    const patterns = repository.getPatternsByNoteId(note.id);
    if (patterns.length === 0) return 0;

    const pspPatterns = patterns.filter(
      (p) => p.pattern_type === "problem" || p.pattern_type === "solution",
    );
    if (pspPatterns.length === 0) return 0;

    const avgConfidence =
      pspPatterns.reduce((sum, p) => sum + p.confidence, 0) / pspPatterns.length;

    const hasProblem = pspPatterns.some((p) => p.pattern_type === "problem");
    const hasSolution = pspPatterns.some((p) => p.pattern_type === "solution");
    const completenessBonus = hasProblem && hasSolution ? 1.0 : 0.5;

    return Math.min(1, avgConfidence * completenessBonus);
  } catch {
    return 0;
  }
}
