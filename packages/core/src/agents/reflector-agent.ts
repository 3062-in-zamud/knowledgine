import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";
import type { GraphRepository } from "../graph/graph-repository.js";
import type { LLMProvider } from "../llm/types.js";
import type {
  ObserverOutput,
  ReflectorOutput,
  ContradictionDetection,
  DeprecationCandidate,
} from "./types.js";

export interface ReflectorAgentConfig {
  maxConcurrency?: number; // default 4
  timeoutMs?: number; // default 30000
  similarityThreshold?: number; // default 0.8 (Jaccard)
}

export interface ReflectorAgentDeps {
  repository: KnowledgeRepository;
  graphRepository: GraphRepository;
  llmProvider?: LLMProvider;
}

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
const LLM_CONTENT_PREVIEW_LENGTH = 200;

/**
 * Jaccardトークンベースのテキスト類似度を計算する。
 * 単語を小文字分割してSetを構築し、積集合/和集合の比率を返す。
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0),
  );
  const tokensB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0),
  );
  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * LLMのresolution判定レスポンスをパースする。
 * 失敗時はnullを返す。
 */
function parseLLMResolution(content: string): {
  resolution: ContradictionDetection["resolution"];
  reasoning: string;
} | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "resolution" in parsed &&
      "reasoning" in parsed
    ) {
      const obj = parsed as { resolution: unknown; reasoning: unknown };
      const validResolutions = ["deprecate_old", "deprecate_new", "merge", "keep_both"] as const;
      if (
        validResolutions.includes(obj.resolution as (typeof validResolutions)[number]) &&
        typeof obj.reasoning === "string"
      ) {
        return {
          resolution: obj.resolution as ContradictionDetection["resolution"],
          reasoning: obj.reasoning,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
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

/**
 * ルールベースのデフォルトresolutionを返す。
 * 矛盾タイプに応じてresolutionを設定する。
 */
function defaultResolution(
  contradictionType: ContradictionDetection["contradictionType"],
): ContradictionDetection["resolution"] {
  switch (contradictionType) {
    case "supersede":
      return "deprecate_old";
    case "factual":
      return "deprecate_old";
    case "temporal":
      return "keep_both";
    case "preference_change":
      return "deprecate_old";
    default:
      return "keep_both";
  }
}

export class ReflectorAgent {
  private readonly maxConcurrency: number;
  private readonly similarityThreshold: number;

  constructor(
    private readonly deps: ReflectorAgentDeps,
    config?: ReflectorAgentConfig,
  ) {
    this.maxConcurrency = config?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.similarityThreshold = config?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  }

  /**
   * 矛盾検出 + deprecation候補提示（実行はしない）
   */
  async reflect(observerOutput: ObserverOutput): Promise<ReflectorOutput> {
    const startTime = Date.now();

    const note = this.deps.repository.getNoteById(observerOutput.noteId);
    if (!note) {
      const processingTimeMs = Date.now() - startTime;
      return {
        noteId: observerOutput.noteId,
        contradictions: [],
        deprecationCandidates: [],
        versionUpdates: [],
        processingMode: "rule",
        processingTimeMs,
        errors: [`Note not found: ${observerOutput.noteId}`],
      } as ReflectorOutput & { errors?: string[] };
    }

    // ルールベースで矛盾検出
    const allNotes = this.deps.repository.getAllNotes().filter((n) => n.id !== note.id);
    const contradictions = await this.detectContradictions(note, observerOutput, allNotes);

    // LLM補完モード: ルールベースで検出した矛盾にLLM判定を追加
    let usedLLM = false;
    const enrichedContradictions = [...contradictions];

    if (this.deps.llmProvider && contradictions.length > 0) {
      try {
        const isAvailable = await this.deps.llmProvider.isAvailable();
        if (isAvailable) {
          await this.enrichWithLLM(note, enrichedContradictions);
          usedLLM = true;
        }
      } catch {
        // LLMエラーはサイレントに無視してルールベースにフォールバック
      }
    }

    // deprecation候補の生成（高信頼度の矛盾から生成）
    const deprecationCandidates = this.buildDeprecationCandidates(enrichedContradictions);

    // versionUpdates: supersedeタイプの矛盾からバージョン更新情報を生成
    const versionUpdates = this.buildVersionUpdates(note, enrichedContradictions);

    const processingTimeMs = Date.now() - startTime;

    return {
      noteId: note.id,
      contradictions: enrichedContradictions,
      deprecationCandidates,
      versionUpdates,
      processingMode: usedLLM ? "hybrid" : "rule",
      processingTimeMs,
    };
  }

  /**
   * バッチ処理: 複数のObserverOutputを並列で処理する
   */
  async reflectBatch(outputs: ObserverOutput[]): Promise<ReflectorOutput[]> {
    if (outputs.length === 0) return [];

    const tasks = outputs.map((output) => async (): Promise<ReflectorOutput> => {
      try {
        return await this.reflect(output);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          noteId: output.noteId,
          contradictions: [],
          deprecationCandidates: [],
          versionUpdates: [],
          processingMode: "rule",
          processingTimeMs: 0,
          errors: [`batch processing error: ${message}`],
        } as ReflectorOutput & { errors?: string[] };
      }
    });

    return runWithConcurrency(tasks, this.maxConcurrency);
  }

  /**
   * ユーザー承認後にdeprecationを実行する（best-effort方式）
   */
  applyApprovedDeprecations(candidates: DeprecationCandidate[]): void {
    for (const candidate of candidates) {
      try {
        this.deps.repository.deprecateNote(candidate.noteId, candidate.reason);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[ReflectorAgent] Failed to deprecate note ${candidate.noteId}: ${message}`);
      }
    }
  }

  /**
   * ルールベースの矛盾検出を実行する。
   * 4種類の矛盾タイプを検出する。
   */
  private async detectContradictions(
    note: KnowledgeNote,
    observerOutput: ObserverOutput,
    allNotes: KnowledgeNote[],
  ): Promise<ContradictionDetection[]> {
    const contradictions: ContradictionDetection[] = [];

    // 1. supersede検出: Jaccard類似度 >= threshold
    const supersedeResults = this.detectSupersede(note, allNotes);
    contradictions.push(...supersedeResults);

    // 2. factual矛盾: updatesカテゴリ + entity一致
    const factualResults = await this.detectFactual(note, observerOutput, allNotes);
    contradictions.push(...factualResults);

    // 3. temporal矛盾: valid_fromの逆転
    const temporalResults = this.detectTemporal(note, allNotes, contradictions);
    contradictions.push(...temporalResults);

    // 4. preference変更: preferencesカテゴリの変化
    const preferenceResults = this.detectPreferenceChange(note, observerOutput, allNotes);
    contradictions.push(...preferenceResults);

    return contradictions;
  }

  /**
   * supersede検出: 類似ノートをJaccard類似度で判定する
   */
  private detectSupersede(
    note: KnowledgeNote,
    allNotes: KnowledgeNote[],
  ): ContradictionDetection[] {
    const results: ContradictionDetection[] = [];
    const noteContent = note.content ?? "";

    for (const existing of allNotes) {
      if (existing.deprecated === 1) continue;
      const existingContent = existing.content ?? "";
      const similarity = jaccardSimilarity(noteContent, existingContent);

      if (similarity >= this.similarityThreshold) {
        // 新しいノートが古いノートをsupersede
        results.push({
          newVectorIndex: -1, // supersede検出はベクトルインデックスなし
          existingNoteId: existing.id,
          existingContent: existingContent.slice(0, LLM_CONTENT_PREVIEW_LENGTH),
          contradictionType: "supersede",
          confidence: similarity,
          resolution: defaultResolution("supersede"),
          reasoning: `Jaccard similarity: ${similarity.toFixed(3)} >= threshold: ${this.similarityThreshold}`,
        });
      }
    }

    return results;
  }

  /**
   * factual矛盾検出: updatesカテゴリのベクトルと既存ノートのentityを照合する
   */
  private async detectFactual(
    note: KnowledgeNote,
    observerOutput: ObserverOutput,
    allNotes: KnowledgeNote[],
  ): Promise<ContradictionDetection[]> {
    const results: ContradictionDetection[] = [];

    const updateVectors = observerOutput.vectors.filter((v) => v.category === "updates");
    if (updateVectors.length === 0) return results;

    const noteEntityNames = new Set(observerOutput.entities.map((e) => e.name.toLowerCase()));
    if (noteEntityNames.size === 0) return results;

    // entity名で既存ノートを検索
    for (const entityName of noteEntityNames) {
      const entityObj = this.deps.graphRepository.getEntityByName(entityName);
      if (!entityObj) continue;

      const linkedNotes = this.deps.graphRepository.getLinkedNotes(entityObj.id);
      for (const link of linkedNotes) {
        const existingNote = allNotes.find((n) => n.id === link.noteId);
        if (!existingNote || existingNote.deprecated === 1) continue;

        // 既存ノートと新ノートの内容が異なる = factual矛盾
        const existingContent = existingNote.content ?? "";
        const noteContent = note.content ?? "";
        if (existingContent === noteContent) continue;

        // 同一entity + 異なるcontent = factual矛盾
        // ただし、supersedeとの重複を避けるため類似度が低い場合のみ
        const similarity = jaccardSimilarity(noteContent, existingContent);
        if (similarity >= this.similarityThreshold) continue; // supersedeで処理済み

        for (let i = 0; i < updateVectors.length; i++) {
          results.push({
            newVectorIndex: i,
            existingNoteId: existingNote.id,
            existingContent: existingContent.slice(0, LLM_CONTENT_PREVIEW_LENGTH),
            contradictionType: "factual",
            confidence: 0.7,
            resolution: defaultResolution("factual"),
            reasoning: `Entity "${entityName}" appears in both notes with different content`,
          });
          break; // 同一既存ノートに対して1つだけ
        }
      }
    }

    return results;
  }

  /**
   * temporal矛盾検出: 新ノートのvalid_fromが既存ノートより前の場合
   */
  private detectTemporal(
    note: KnowledgeNote,
    allNotes: KnowledgeNote[],
    _existingContradictions: ContradictionDetection[],
  ): ContradictionDetection[] {
    const results: ContradictionDetection[] = [];
    const noteValidFrom = note.valid_from;
    if (!noteValidFrom) return results;

    const noteValidFromDate = new Date(noteValidFrom).getTime();

    for (const existing of allNotes) {
      if (!existing.valid_from || existing.deprecated === 1) continue;

      const existingValidFromDate = new Date(existing.valid_from).getTime();
      // 新しいノートのvalid_fromが古いノートより前 = 時系列の逆転
      if (noteValidFromDate < existingValidFromDate) {
        // 内容の類似性をチェック（無関係なノートは除外）
        const similarity = jaccardSimilarity(note.content ?? "", existing.content ?? "");
        if (similarity < 0.2) continue;

        results.push({
          newVectorIndex: -1,
          existingNoteId: existing.id,
          existingContent: (existing.content ?? "").slice(0, LLM_CONTENT_PREVIEW_LENGTH),
          contradictionType: "temporal",
          confidence: 0.6,
          resolution: defaultResolution("temporal"),
          reasoning: `New note valid_from (${noteValidFrom}) is before existing note valid_from (${existing.valid_from})`,
        });
      }
    }

    return results;
  }

  /**
   * preference変更検出: preferencesカテゴリの同ツール/技術に対する異なる評価
   */
  private detectPreferenceChange(
    note: KnowledgeNote,
    observerOutput: ObserverOutput,
    allNotes: KnowledgeNote[],
  ): ContradictionDetection[] {
    const results: ContradictionDetection[] = [];

    const prefVectors = observerOutput.vectors.filter((v) => v.category === "preferences");
    if (prefVectors.length === 0) return results;

    // preferencesカテゴリを含む既存ノートを検索
    // "prefer"/"preference"などのキーワードで類似ノートを探す
    for (let i = 0; i < prefVectors.length; i++) {
      const prefContent = prefVectors[i].content.toLowerCase();

      for (const existing of allNotes) {
        if (existing.deprecated === 1) continue;
        const existingContent = (existing.content ?? "").toLowerCase();

        // "prefer"を含む既存ノートを対象にする
        if (!existingContent.includes("prefer")) continue;

        // 完全一致は除外
        if (existingContent === (note.content ?? "").toLowerCase()) continue;

        // キーワードが重なるが内容が異なる場合
        const prefTokens = new Set(prefContent.split(/\s+/).filter((t) => t.length > 2));
        const existingTokens = new Set(existingContent.split(/\s+/).filter((t) => t.length > 2));
        const sharedTokens = [...prefTokens].filter((t) => existingTokens.has(t));

        // 共有トークンが少なくとも1つある = 同じトピックの異なるpreference
        if (sharedTokens.length > 0) {
          results.push({
            newVectorIndex: i,
            existingNoteId: existing.id,
            existingContent: (existing.content ?? "").slice(0, LLM_CONTENT_PREVIEW_LENGTH),
            contradictionType: "preference_change",
            confidence: 0.65,
            resolution: defaultResolution("preference_change"),
            reasoning: `Preference change detected for shared topics: ${sharedTokens.slice(0, 3).join(", ")}`,
          });
          break; // 同一prefVectorに対して1つのみ
        }
      }
    }

    return results;
  }

  /**
   * LLMでresolutionを補完する（矛盾配列を直接変更する）
   */
  private async enrichWithLLM(
    note: KnowledgeNote,
    contradictions: ContradictionDetection[],
  ): Promise<void> {
    if (!this.deps.llmProvider) return;

    for (const contradiction of contradictions) {
      const notePreview = (note.content ?? "").slice(0, LLM_CONTENT_PREVIEW_LENGTH);
      const existingPreview = contradiction.existingContent.slice(0, LLM_CONTENT_PREVIEW_LENGTH);

      const prompt = `以下の2つのナレッジノートに矛盾が検出されました。適切な解決方法を判定してください。

ノートA (ID: ${note.id}): ${notePreview}
ノートB (ID: ${contradiction.existingNoteId}): ${existingPreview}
矛盾タイプ: ${contradiction.contradictionType}

解決方法をJSON形式で返してください:
{"resolution": "deprecate_old"|"deprecate_new"|"merge"|"keep_both", "reasoning": "理由"}`;

      try {
        const result = await this.deps.llmProvider.complete({
          messages: [{ role: "user", content: prompt }],
          responseFormat: "json",
          temperature: 0.0,
        });

        const parsed = parseLLMResolution(result.content);
        if (parsed) {
          contradiction.resolution = parsed.resolution;
          contradiction.reasoning = parsed.reasoning;
        }
      } catch {
        // LLMエラーは無視してルールベースのresolutionを維持
      }
    }
  }

  /**
   * 矛盾からdeprecation候補を生成する
   */
  private buildDeprecationCandidates(
    contradictions: ContradictionDetection[],
  ): DeprecationCandidate[] {
    const candidateMap = new Map<number, DeprecationCandidate>();

    for (const contradiction of contradictions) {
      if (contradiction.resolution !== "deprecate_old") continue;
      if (contradiction.confidence < 0.5) continue;

      const existing = candidateMap.get(contradiction.existingNoteId);
      if (existing) {
        existing.contradictions.push(contradiction);
        existing.confidence = Math.max(existing.confidence, contradiction.confidence);
      } else {
        candidateMap.set(contradiction.existingNoteId, {
          noteId: contradiction.existingNoteId,
          reason: `矛盾検出 (${contradiction.contradictionType}): ${contradiction.reasoning}`,
          confidence: contradiction.confidence,
          contradictions: [contradiction],
        });
      }
    }

    return [...candidateMap.values()];
  }

  /**
   * supersedeタイプの矛盾からversionUpdates情報を生成する
   */
  private buildVersionUpdates(
    note: KnowledgeNote,
    contradictions: ContradictionDetection[],
  ): ReflectorOutput["versionUpdates"] {
    const supersedeContras = contradictions.filter(
      (c) => c.contradictionType === "supersede" && c.resolution === "deprecate_old",
    );

    return supersedeContras.map((c) => ({
      noteId: note.id,
      newVersion: (note.version ?? 1) + 1,
      supersedesNoteId: c.existingNoteId,
    }));
  }
}
