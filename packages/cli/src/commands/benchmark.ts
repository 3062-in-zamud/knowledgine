import { resolve } from "path";
import { existsSync } from "fs";
import { createDatabase, Migrator, ALL_MIGRATIONS } from "@knowledgine/core";

export interface BenchmarkOptions {
  path?: string;
  semantic?: boolean;
}

function cosineSimilarityFromL2(a: Float32Array, b: Float32Array): number {
  // L2-normalized vectors: cosine_similarity = 1 - L2_distance^2 / 2
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  const l2dist = Math.sqrt(sumSq);
  return Math.max(0, 1 - (l2dist * l2dist) / 2);
}

function sampleIndices(total: number, maxSamples: number): number[] {
  if (total <= maxSamples) return Array.from({ length: total }, (_, i) => i);
  const step = total / maxSamples;
  return Array.from({ length: maxSamples }, (_, i) => Math.floor(i * step));
}

export async function benchmarkCommand(options: BenchmarkOptions): Promise<void> {
  const rootPath = options.path ? resolve(options.path) : process.cwd();
  const dbPath = resolve(rootPath, ".knowledgine", "index.sqlite");

  if (!existsSync(dbPath)) {
    console.error(`Error: Database not found at ${dbPath}`);
    console.error("Run 'knowledgine init --path <dir>' first.");
    process.exit(1);
  }

  if (!options.semantic) {
    console.error("Use --semantic to run the semantic score distribution benchmark.");
    process.exit(0);
  }

  let db: ReturnType<typeof createDatabase>;
  try {
    db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
  } catch (err) {
    console.error(`Error opening database: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Count total embeddings first to avoid loading all BLOBs into memory.
  type EmbRow = { note_id: number; embedding: Buffer; dimensions: number };
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM note_embeddings").get() as
    | { count: number }
    | undefined;

  const totalEmbeddings = countRow?.count ?? 0;

  if (totalEmbeddings === 0) {
    console.error("No embeddings found. Run 'knowledgine upgrade --semantic' first.");
    db.close();
    process.exit(0);
  }

  const MAX_SAMPLES = 50;
  const indices = sampleIndices(totalEmbeddings, MAX_SAMPLES);

  // Fetch only the sampled rows by offset to avoid loading all BLOBs.
  const stmtOffset = db.prepare(
    "SELECT note_id, embedding, dimensions FROM note_embeddings ORDER BY note_id LIMIT 1 OFFSET ?",
  );
  const sample: EmbRow[] = indices
    .map((offset) => stmtOffset.get(offset) as EmbRow | undefined)
    .filter((row): row is EmbRow => row !== undefined);

  console.error(`\nSemantic Score Distribution Benchmark`);
  console.error(`Total embeddings: ${totalEmbeddings}`);
  console.error(`Sample size: ${sample.length}`);
  console.error(`Computing pairwise cosine similarities...\n`);

  const BYTES_PER_FLOAT32 = 4;
  const scores: number[] = [];
  let skippedPairs = 0;

  for (let i = 0; i < sample.length; i++) {
    const rowA = sample[i];
    const dimsA = rowA.dimensions;
    const maxFloatsA = rowA.embedding.byteLength / BYTES_PER_FLOAT32;
    if (!Number.isInteger(dimsA) || dimsA <= 0 || dimsA > maxFloatsA) continue;

    const a = new Float32Array(rowA.embedding.buffer, rowA.embedding.byteOffset, dimsA);

    for (let j = i + 1; j < sample.length; j++) {
      const rowB = sample[j];
      const dimsB = rowB.dimensions;
      const maxFloatsB = rowB.embedding.byteLength / BYTES_PER_FLOAT32;
      if (!Number.isInteger(dimsB) || dimsB <= 0 || dimsB > maxFloatsB || dimsB !== dimsA) {
        skippedPairs++;
        continue;
      }
      const b = new Float32Array(rowB.embedding.buffer, rowB.embedding.byteOffset, dimsB);
      scores.push(cosineSimilarityFromL2(a, b));
    }
  }

  if (scores.length === 0) {
    console.error(
      "Not enough samples to compute distribution (need at least 2 valid matching-dimension embeddings).",
    );
    if (skippedPairs > 0) {
      console.error(
        `Note: Skipped ${skippedPairs} pair(s) due to invalid or mismatched dimensions.`,
      );
    }
    db.close();
    return;
  }

  if (skippedPairs > 0) {
    console.error(`Note: Skipped ${skippedPairs} pair(s) with invalid or mismatched dimensions.`);
  }

  scores.sort((a, b) => a - b);

  const n = scores.length;
  const mean = scores.reduce((s, x) => s + x, 0) / n;
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const min = scores[0];
  const max = scores[n - 1];
  const p25 = scores[Math.floor(n * 0.25)];
  const median = scores[Math.floor(n * 0.5)];
  const p75 = scores[Math.floor(n * 0.75)];
  const p90 = scores[Math.floor(n * 0.9)];

  console.error(`Results (${n} pairs):`);
  console.error(`  mean:   ${(mean * 100).toFixed(2)}%`);
  console.error(`  stddev: ${(stddev * 100).toFixed(2)}%`);
  console.error(`  min:    ${(min * 100).toFixed(2)}%`);
  console.error(`  p25:    ${(p25 * 100).toFixed(2)}%`);
  console.error(`  median: ${(median * 100).toFixed(2)}%`);
  console.error(`  p75:    ${(p75 * 100).toFixed(2)}%`);
  console.error(`  p90:    ${(p90 * 100).toFixed(2)}%`);
  console.error(`  max:    ${(max * 100).toFixed(2)}%`);
  console.error("");

  if (stddev < 0.05) {
    console.error("Warning: Low stddev indicates score flattening. Check embedding normalization.");
  } else {
    console.error("Score distribution looks healthy (stddev >= 5%).");
  }
  console.error("");

  // Also output as JSON to stdout for scripting
  console.log(
    JSON.stringify(
      {
        totalEmbeddings: totalEmbeddings,
        sampleSize: sample.length,
        pairCount: n,
        mean: parseFloat((mean * 100).toFixed(4)),
        stddev: parseFloat((stddev * 100).toFixed(4)),
        min: parseFloat((min * 100).toFixed(4)),
        p25: parseFloat((p25 * 100).toFixed(4)),
        median: parseFloat((median * 100).toFixed(4)),
        p75: parseFloat((p75 * 100).toFixed(4)),
        p90: parseFloat((p90 * 100).toFixed(4)),
        max: parseFloat((max * 100).toFixed(4)),
      },
      null,
      2,
    ),
  );

  db.close();
}
