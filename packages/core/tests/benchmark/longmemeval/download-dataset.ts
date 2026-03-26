/**
 * LongMemEval データセット取得スクリプト
 *
 * License: LongMemEval is released under CC BY 4.0
 * Source: https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned
 *
 * Usage:
 *   pnpm --filter @knowledgine/core tsx tests/benchmark/longmemeval/download-dataset.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATASET_URL =
  "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json";

const FIXTURES_DIR = join(__dirname, "fixtures");
const OUTPUT_PATH = join(FIXTURES_DIR, "longmemeval_s_cleaned.json");

export async function downloadDataset(): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true });

  console.log(`[download] Fetching from HuggingFace...`);
  console.log(`[download] URL: ${DATASET_URL}`);

  const res = await fetch(DATASET_URL);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.text();
  // Use exclusive flag to atomically write only if file doesn't exist (avoids TOCTOU race)
  try {
    writeFileSync(OUTPUT_PATH, data, { flag: "wx", encoding: "utf-8" });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      console.log(`[download] Already downloaded: ${OUTPUT_PATH}`);
      console.log("[download] Skipping. Delete the file to re-download.");
      return;
    }
    throw err;
  }

  const sizeKb = (Buffer.byteLength(data, "utf-8") / 1024).toFixed(1);
  console.log(`[download] Saved ${sizeKb} KB to ${OUTPUT_PATH}`);
  console.log("[download] License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)");
}

// スクリプトとして直接実行された場合
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  downloadDataset().catch((err) => {
    console.error("[download] Error:", err);
    process.exit(1);
  });
}
