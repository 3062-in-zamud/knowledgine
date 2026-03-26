/**
 * LongMemEval ベンチマーク実行エントリポイント
 *
 * 環境変数:
 *   LONGMEMEVAL_MODE=keyword|hybrid|agentic  (default: keyword)
 *   LONGMEMEVAL_JUDGE=ollama|rule            (default: rule)
 */
import type { LongMemEvalEntry, BenchmarkReport, EvalResult } from "./types.js";
import { LongMemEvalAdapter } from "./longmemeval-adapter.js";
import { LongMemEvalEvaluator } from "./longmemeval-evaluator.js";
import { detectCategory } from "./longmemeval-adapter.js";

export type RunMode = "keyword" | "hybrid" | "agentic";
export type JudgeMode = "ollama" | "rule";

export interface RunnerOptions {
  mode?: RunMode;
  judgeMode?: JudgeMode;
  onProgress?: (current: number, total: number, questionId: string) => void;
}

export async function runBenchmark(
  entries: LongMemEvalEntry[],
  options: RunnerOptions = {},
): Promise<BenchmarkReport> {
  const mode: RunMode =
    (process.env.LONGMEMEVAL_MODE as RunMode | undefined) ?? options.mode ?? "keyword";
  const judgeModeEnv = process.env.LONGMEMEVAL_JUDGE as JudgeMode | undefined;
  const judgeMode: JudgeMode = judgeModeEnv ?? options.judgeMode ?? "rule";

  const adapter = new LongMemEvalAdapter();
  const evaluator =
    judgeMode === "ollama"
      ? LongMemEvalEvaluator.createDefault()
      : LongMemEvalEvaluator.createRuleBased();

  const results: EvalResult[] = [];
  let totalLatencyMs = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    options.onProgress?.(i + 1, entries.length, entry.question_id);

    const { context, adaptedQuery } = adapter.adaptAndRun(entry, mode);

    const start = performance.now();
    let hypothesis = "";
    const retrievedNoteIds: number[] = [];

    try {
      const searchResults = await context.searcher.search(adaptedQuery.searchOptions);
      const latencyMs = performance.now() - start;
      totalLatencyMs += latencyMs;

      for (const r of searchResults) {
        retrievedNoteIds.push(r.note.id);
      }

      // 上位検索結果のコンテンツから回答生成
      const category = detectCategory(entry);
      if (searchResults.length > 0) {
        if (category === "multi-session") {
          // multi-session: 上位3件のノートを結合して全コンテキストを提供
          hypothesis = searchResults
            .slice(0, 3)
            .map((r) => r.note.content)
            .join("\n\n---\n\n");
        } else {
          hypothesis = searchResults[0].note.content;
        }
      }

      const result = await evaluator.judge(
        entry.question,
        hypothesis,
        String(entry.answer),
        category,
        entry.question_id,
        retrievedNoteIds,
        latencyMs,
      );
      results.push(result);
    } finally {
      context.db.close();
    }
  }

  const scores = evaluator.computeScores(results);

  return {
    timestamp: new Date().toISOString(),
    datasetVersion: "longmemeval_s_cleaned",
    mode,
    overallAccuracy: scores.overallAccuracy,
    taskAveragedAccuracy: scores.taskAveragedAccuracy,
    abstentionAccuracy: scores.abstentionAccuracy,
    categoryScores: scores.categoryScores,
    totalQuestions: results.length,
    totalLatencyMs,
    avgLatencyMs: results.length > 0 ? totalLatencyMs / results.length : 0,
  };
}
