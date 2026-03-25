import type { KnowledgeNote } from "../storage/knowledge-repository.js";
import type { LLMProvider } from "../llm/types.js";
import type { KnowledgeRepository } from "../storage/knowledge-repository.js";
import { PatternExtractor } from "../extraction/pattern-extractor.js";
import { EntityExtractor } from "../graph/entity-extractor.js";
import type { ObserverOutput, KnowledgeVector } from "./types.js";
import { classifyByRules, parseLLMVectorResponse } from "./vector-classification-rules.js";

export interface ObserverAgentConfig {
  maxConcurrency?: number; // default 4
  timeoutMs?: number; // default 30000
}

export interface ObserverAgentDeps {
  patternExtractor: PatternExtractor;
  entityExtractor: EntityExtractor;
  llmProvider?: LLMProvider;
  repository: KnowledgeRepository;
}

const DEFAULT_MAX_CONCURRENCY = 4;
const LLM_CONTENT_PREVIEW_LENGTH = 500;

const LLM_SYSTEM_PROMPT = `あなたはナレッジ分類エージェントです。以下のテキストから6つのカテゴリに分類してください。
各カテゴリについて、該当するコンテンツとconfidence(0-1)をJSON形式で返してください。

カテゴリ:
- personal_info: 開発者のスキル・経歴
- preferences: ツール嗜好・コーディングスタイル
- events: 障害報告・リリース・会議
- temporal_data: 期限・バージョン変遷
- updates: 既存知識の更新・修正
- assistant_info: プロジェクト設定・チーム構成

レスポンスはJSON配列で返してください:
[{"category": "...", "content": "...", "confidence": 0.0}]`;

/**
 * frontmatterのJSONをパースする。失敗時は空オブジェクトを返す。
 */
function parseFrontmatter(frontmatterJson: string | null): Record<string, unknown> {
  if (!frontmatterJson) return {};
  try {
    const parsed = JSON.parse(frontmatterJson) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * LLMのベクトルをルールベースの結果にマージする。
 * LLMのconfidenceが高い場合はLLM優先（同一contentの重複を排除）。
 */
function mergeVectors(
  ruleVectors: KnowledgeVector[],
  llmVectors: KnowledgeVector[],
): KnowledgeVector[] {
  if (llmVectors.length === 0) return ruleVectors;

  // LLMベクトルのcontentセットを構築
  const llmContentSet = new Set(llmVectors.map((v) => `${v.category}:${v.content}`));

  // ルールベースで、LLMと重複しないものを残す
  const filteredRuleVectors = ruleVectors.filter(
    (v) => !llmContentSet.has(`${v.category}:${v.content}`),
  );

  return [...filteredRuleVectors, ...llmVectors];
}

/**
 * 並列処理をconcurrency数で制限してPromiseを実行する
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

export class ObserverAgent {
  private readonly maxConcurrency: number;

  constructor(
    private readonly deps: ObserverAgentDeps,
    config?: ObserverAgentConfig,
  ) {
    this.maxConcurrency = config?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  }

  /**
   * 単一ノートの6ベクトル分類を実行する
   */
  async observe(note: KnowledgeNote): Promise<ObserverOutput> {
    const startTime = Date.now();
    const errors: string[] = [];

    const frontmatter = parseFrontmatter(note.frontmatter_json);
    const content = note.content ?? "";

    // Step 1: パターン抽出
    const dailyPatterns = this.deps.patternExtractor.extractDailyPatterns(content);
    const ticketPatterns = this.deps.patternExtractor.extractTicketPatterns(content);
    const patterns = [...dailyPatterns, ...ticketPatterns];

    // Step 2: エンティティ抽出
    const entities = this.deps.entityExtractor.extract(content, frontmatter);

    // Step 3: ルールベース分類
    const ruleVectors = classifyByRules(patterns, entities, frontmatter, content);

    // Step 4: LLM補完（LLMが利用可能な場合）
    let llmVectors: KnowledgeVector[] = [];
    let usedLLM = false;

    if (this.deps.llmProvider) {
      try {
        const isAvailable = await this.deps.llmProvider.isAvailable();
        if (isAvailable) {
          const preview = content.slice(0, LLM_CONTENT_PREVIEW_LENGTH);
          const frontmatterStr = note.frontmatter_json
            ? `\nfrontmatter: ${note.frontmatter_json}`
            : "";

          const result = await this.deps.llmProvider.complete({
            messages: [
              { role: "system", content: LLM_SYSTEM_PROMPT },
              {
                role: "user",
                content: `テキスト:\n${preview}${frontmatterStr}`,
              },
            ],
            responseFormat: "json",
            temperature: 0.0,
          });

          const parsed = parseLLMVectorResponse(result.content);
          if (parsed !== null) {
            llmVectors = parsed;
            usedLLM = true;
          }
          // パース失敗時はllmVectors=[]のままフォールバック
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`LLM error: ${message}`);
        // フォールバック: ルールベースのみで返却
      }
    }

    // Step 5: マージ
    const mergedVectors = usedLLM ? mergeVectors(ruleVectors, llmVectors) : ruleVectors;

    const processingTimeMs = Date.now() - startTime;

    return {
      noteId: note.id,
      vectors: mergedVectors,
      patterns,
      entities,
      processingMode: usedLLM ? "hybrid" : "rule",
      processingTimeMs,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 複数ノートを並列処理して全結果を返す
   * maxConcurrencyで並列数を制限し、部分失敗はerrorsに記録して返す
   */
  async observeBatch(notes: KnowledgeNote[]): Promise<ObserverOutput[]> {
    if (notes.length === 0) return [];

    const tasks = notes.map((note) => async (): Promise<ObserverOutput> => {
      try {
        return await this.observe(note);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          noteId: note.id,
          vectors: [],
          patterns: [],
          entities: [],
          processingMode: "rule",
          processingTimeMs: 0,
          errors: [`batch processing error: ${message}`],
        };
      }
    });

    return runWithConcurrency(tasks, this.maxConcurrency);
  }
}
