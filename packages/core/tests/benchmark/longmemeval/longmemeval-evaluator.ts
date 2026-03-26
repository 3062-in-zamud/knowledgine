/**
 * LongMemEval スコア計算
 *
 * デフォルト: OllamaProvider による LLM ジャッジ（本家プロンプト準拠）
 * フォールバック: ルールベース（文字列正規化 + 部分一致）
 *
 * スコア計算は本家 print_qa_metrics.py 準拠:
 *   - Task-Averaged Accuracy: 6カテゴリ別 accuracy の平均（主指標）
 *   - Overall Accuracy: 全問題バイナリラベル平均
 *   - Abstention Accuracy: _abs 問題のみ
 */
import type { LLMProvider } from "../../../src/llm/types.js";
import { OllamaProvider } from "../../../src/llm/ollama-provider.js";
import type { LongMemEvalCategory, EvalResult, CategoryScore } from "./types.js";

const LLM_JUDGE_PROMPT = `You are evaluating whether a system's answer is correct.

Question: {question}
Expected Answer: {expected}
System Answer: {hypothesis}

Is the system answer correct? Answer with only "yes" or "no".`;

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 数値ワード（"three", "seven"等）をアラビア数字に変換する。
 */
function normalizeNumbers(text: string): string {
  return text.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi,
    (m) => NUMBER_WORDS[m.toLowerCase()] ?? m,
  );
}

/**
 * "7 days. 8 days (including the last day) is also acceptable." のような
 * 複数回答形式から、全ての数値候補を抽出する。
 */
function extractAcceptableNumbers(expectedAnswer: string): string[] {
  const norm = normalizeText(normalizeNumbers(expectedAnswer));
  return norm.match(/\d+(\.\d+)?/g) ?? [];
}

function ruleBasedJudge(hypothesis: string, expectedAnswer: string): boolean {
  if (!hypothesis || hypothesis.trim() === "") return false;

  const normHyp = normalizeText(normalizeNumbers(hypothesis));
  const normExp = normalizeText(normalizeNumbers(expectedAnswer));

  if (normHyp === normExp) return true;
  if (normHyp.includes(normExp)) return true;
  if (normExp.includes(normHyp) && normHyp.length > 3) return true;

  // 数値一致チェック（複数回答形式も考慮: "7 days. 8 days ... is also acceptable"）
  const expNumbers = extractAcceptableNumbers(expectedAnswer);
  if (expNumbers.length > 0) {
    const hypNumbers = normHyp.match(/\d+(\.\d+)?/g) ?? [];
    // 期待される数値のいずれかが仮説に含まれれば正解
    if (expNumbers.some((n) => hypNumbers.includes(n))) return true;
  }

  // トークンレベルの部分一致: 期待回答のキーワードの大部分が仮説に含まれるか
  const expTokens = normExp.split(/\s+/).filter((w) => w.length > 3);
  if (expTokens.length >= 3) {
    const matchCount = expTokens.filter((t) => normHyp.includes(t)).length;
    // 60%以上のトークンが一致すれば正解とみなす
    if (matchCount / expTokens.length >= 0.6) return true;
  }

  return false;
}

async function llmJudge(
  llm: LLMProvider,
  question: string,
  hypothesis: string,
  expectedAnswer: string,
): Promise<boolean> {
  const prompt = LLM_JUDGE_PROMPT.replace("{question}", question)
    .replace("{expected}", expectedAnswer)
    .replace("{hypothesis}", hypothesis);

  try {
    const result = await llm.complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
      maxTokens: 10,
    });
    const answer = result.content.trim().toLowerCase();
    return answer.startsWith("yes");
  } catch {
    // LLM 呼び出し失敗時はルールベースにフォールバック
    return ruleBasedJudge(hypothesis, expectedAnswer);
  }
}

export class LongMemEvalEvaluator {
  private llmProvider: LLMProvider | undefined;
  private judgeMethod: "llm" | "rule";

  constructor(llmProvider?: LLMProvider, judgeMethod: "llm" | "rule" = "llm") {
    this.llmProvider = llmProvider;
    this.judgeMethod = judgeMethod;
  }

  static createDefault(): LongMemEvalEvaluator {
    const llm = new OllamaProvider({ model: "llama3.2" });
    return new LongMemEvalEvaluator(llm, "llm");
  }

  static createRuleBased(): LongMemEvalEvaluator {
    return new LongMemEvalEvaluator(undefined, "rule");
  }

  async judge(
    question: string,
    hypothesis: string,
    expectedAnswer: string,
    category: LongMemEvalCategory,
    questionId: string,
    retrievedNoteIds: number[],
    retrievalLatencyMs: number,
  ): Promise<EvalResult> {
    const isAbstention = questionId.endsWith("_abs");
    let correct: boolean;
    let evalMethod: "llm" | "rule";

    if (this.judgeMethod === "llm" && this.llmProvider && (await this.llmProvider.isAvailable())) {
      correct = await llmJudge(this.llmProvider, question, hypothesis, expectedAnswer);
      evalMethod = "llm";
    } else {
      correct = ruleBasedJudge(hypothesis, expectedAnswer);
      evalMethod = "rule";
    }

    return {
      questionId,
      category,
      isAbstention,
      correct,
      hypothesis,
      expectedAnswer,
      retrievedNoteIds,
      retrievalLatencyMs,
      evalMethod,
    };
  }

  computeScores(results: EvalResult[]): {
    overallAccuracy: number;
    taskAveragedAccuracy: number;
    abstentionAccuracy: number;
    categoryScores: CategoryScore[];
  } {
    if (results.length === 0) {
      return {
        overallAccuracy: 0,
        taskAveragedAccuracy: 0,
        abstentionAccuracy: 0,
        categoryScores: [],
      };
    }

    // Overall Accuracy
    const overallAccuracy = results.filter((r) => r.correct).length / results.length;

    // Abstention Accuracy
    const abstentionResults = results.filter((r) => r.isAbstention);
    const abstentionAccuracy =
      abstentionResults.length > 0
        ? abstentionResults.filter((r) => r.correct).length / abstentionResults.length
        : 0;

    // Category scores
    const allCategories: LongMemEvalCategory[] = [
      "single-session-user",
      "single-session-assistant",
      "single-session-preference",
      "temporal-reasoning",
      "knowledge-update",
      "multi-session",
    ];

    const categoryScores: CategoryScore[] = [];
    for (const category of allCategories) {
      const catResults = results.filter((r) => r.category === category);
      if (catResults.length === 0) continue;
      const correct = catResults.filter((r) => r.correct).length;
      categoryScores.push({
        category,
        accuracy: correct / catResults.length,
        count: catResults.length,
        correct,
      });
    }

    // Task-Averaged Accuracy（主指標）: カテゴリ別 accuracy の平均
    const taskAveragedAccuracy =
      categoryScores.length > 0
        ? categoryScores.reduce((sum, cs) => sum + cs.accuracy, 0) / categoryScores.length
        : 0;

    return {
      overallAccuracy,
      taskAveragedAccuracy,
      abstentionAccuracy,
      categoryScores,
    };
  }
}
