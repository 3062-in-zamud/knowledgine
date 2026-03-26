/**
 * LongMemEval 全500問ベンチマーク（手動実行用、CI 除外）
 *
 * 実行方法:
 *   pnpm run benchmark:longmemeval:download  # データ取得（初回のみ）
 *   pnpm run benchmark:longmemeval           # 全問実行
 *
 * 環境変数:
 *   LONGMEMEVAL_MODE=keyword|hybrid|agentic  (default: keyword)
 *   LONGMEMEVAL_JUDGE=ollama|rule            (default: rule)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { LongMemEvalEntry } from "./types.js";
import { runBenchmark } from "./longmemeval-runner.js";
import { saveReport, generateBadge } from "./longmemeval-reporter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, "fixtures", "longmemeval_s_cleaned.json");
const RESULTS_DIR = join(__dirname, "fixtures", "results");

describe("LongMemEval Full Benchmark (500 questions)", () => {
  it("runs full benchmark and reports scores", async () => {
    if (!existsSync(FIXTURES_PATH)) {
      console.warn(
        "[longmemeval-full] Dataset not found. Run: pnpm run benchmark:longmemeval:download",
      );
      return;
    }

    const raw = readFileSync(FIXTURES_PATH, "utf-8");
    const entries: LongMemEvalEntry[] = JSON.parse(raw);

    console.log(`[longmemeval-full] Loaded ${entries.length} entries`);

    const report = await runBenchmark(entries, {
      onProgress: (current, total, questionId) => {
        if (current % 50 === 0 || current === total) {
          console.log(`[longmemeval-full] Progress: ${current}/${total} (${questionId})`);
        }
      },
    });

    saveReport(report, RESULTS_DIR);

    console.log("\n[longmemeval-full] === Results ===");
    console.log(`  Task-Averaged Accuracy: ${(report.taskAveragedAccuracy * 100).toFixed(1)}%`);
    console.log(`  Overall Accuracy:       ${(report.overallAccuracy * 100).toFixed(1)}%`);
    console.log(`  Abstention Accuracy:    ${(report.abstentionAccuracy * 100).toFixed(1)}%`);
    console.log(`  Avg Latency:            ${report.avgLatencyMs.toFixed(1)} ms/question`);
    console.log(`\n  Badge: ${generateBadge(report)}`);
    console.log("\n  Category breakdown:");
    for (const cs of report.categoryScores) {
      console.log(
        `    ${cs.category.padEnd(30)} ${(cs.accuracy * 100).toFixed(1)}% (${cs.correct}/${cs.count})`,
      );
    }

    expect(report.totalQuestions).toBeGreaterThan(0);
    expect(report.taskAveragedAccuracy).toBeGreaterThanOrEqual(0);
  }, 600_000); // 10分タイムアウト
});
