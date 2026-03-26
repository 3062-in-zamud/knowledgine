/**
 * LongMemEval ベンチマーク結果レポート生成
 */
import { writeFileSync, mkdirSync } from "fs";
import type { BenchmarkReport } from "./types.js";

export function toJson(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}

export function toMarkdown(report: BenchmarkReport, competitors?: Record<string, number>): string {
  const lines: string[] = [];
  lines.push("# LongMemEval Benchmark Report");
  lines.push("");
  lines.push(`**Date:** ${report.timestamp}`);
  lines.push(`**Dataset:** ${report.datasetVersion}`);
  lines.push(`**Mode:** ${report.mode}`);
  lines.push(`**Total Questions:** ${report.totalQuestions}`);
  lines.push(`**Avg Latency:** ${report.avgLatencyMs.toFixed(1)} ms/question`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Score |");
  lines.push("|--------|-------|");
  lines.push(
    `| **Task-Averaged Accuracy** (primary) | **${(report.taskAveragedAccuracy * 100).toFixed(1)}%** |`,
  );
  lines.push(`| Overall Accuracy | ${(report.overallAccuracy * 100).toFixed(1)}% |`);
  lines.push(`| Abstention Accuracy | ${(report.abstentionAccuracy * 100).toFixed(1)}% |`);
  lines.push("");

  lines.push("## Category Scores");
  lines.push("");
  lines.push("| Category | Accuracy | Correct | Total |");
  lines.push("|----------|----------|---------|-------|");
  for (const cs of report.categoryScores) {
    lines.push(
      `| ${cs.category} | ${(cs.accuracy * 100).toFixed(1)}% | ${cs.correct} | ${cs.count} |`,
    );
  }
  lines.push("");

  if (competitors && Object.keys(competitors).length > 0) {
    lines.push("## Comparison");
    lines.push("");
    lines.push("| System | Task-Avg Accuracy |");
    lines.push("|--------|-------------------|");
    lines.push(
      `| **Knowledgine (${report.mode})** | **${(report.taskAveragedAccuracy * 100).toFixed(1)}%** |`,
    );
    for (const [name, score] of Object.entries(competitors)) {
      lines.push(`| ${name} | ${(score * 100).toFixed(1)}% |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function generateBadge(report: BenchmarkReport): string {
  const score = report.taskAveragedAccuracy * 100;
  const color = score >= 70 ? "brightgreen" : score >= 50 ? "yellow" : "red";
  const label = encodeURIComponent("LongMemEval");
  const value = encodeURIComponent(`${score.toFixed(1)}%`);
  return `![LongMemEval](https://img.shields.io/badge/${label}-${value}-${color})`;
}

export function saveReport(
  report: BenchmarkReport,
  outputDir: string,
): { jsonPath: string; mdPath: string } {
  mkdirSync(outputDir, { recursive: true });

  const ts = report.timestamp.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const jsonPath = `${outputDir}/report_${ts}.json`;
  const mdPath = `${outputDir}/report_${ts}.md`;

  writeFileSync(jsonPath, toJson(report), "utf-8");
  writeFileSync(mdPath, toMarkdown(report), "utf-8");

  console.log(`[reporter] Saved JSON: ${jsonPath}`);
  console.log(`[reporter] Saved Markdown: ${mdPath}`);
  console.log(`[reporter] Badge: ${generateBadge(report)}`);

  return { jsonPath, mdPath };
}
