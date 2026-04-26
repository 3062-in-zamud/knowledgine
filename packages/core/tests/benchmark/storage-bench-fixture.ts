/**
 * Seedable synthetic fixture for storage / recall benchmarks.
 *
 * Generates 100 commit-like and 50 issue-like notes plus matching
 * 384-dim L2-normalized embedding vectors. Cluster-structured (10
 * cluster centers, 0.15 noise) so that quantization recall measurements
 * resemble real ONNX-output behavior — a uniformly-random unit-vector
 * corpus does not separate float32 and int8 KNN orderings meaningfully
 * because all pairwise distances concentrate on the unit sphere.
 */

export const FIXTURE_DIM = 384;
export const FIXTURE_NUM_COMMITS = 100;
export const FIXTURE_NUM_ISSUES = 50;
export const FIXTURE_TOTAL_NOTES = FIXTURE_NUM_COMMITS + FIXTURE_NUM_ISSUES;
export const FIXTURE_NUM_CLUSTERS = 10;
export const FIXTURE_NOISE = 0.15;

export interface FixtureNote {
  filePath: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export interface FixtureBundle {
  notes: FixtureNote[];
  embeddings: Float32Array[]; // length === notes.length, each 384-dim
}

function rngSeeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

function gauss(rng: () => number): number {
  // Box-Muller; clamps u to avoid log(0).
  const u = (rng() + 1) / 2 || 1e-9;
  const v = (rng() + 1) / 2;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

function clusterCenters(rng: () => number, count: number, dim: number): Float32Array[] {
  const centers: Float32Array[] = [];
  for (let c = 0; c < count; c++) {
    const v = new Float32Array(dim);
    for (let j = 0; j < dim; j++) v[j] = gauss(rng);
    centers.push(normalize(v));
  }
  return centers;
}

function noisyVector(center: Float32Array, rng: () => number, noise: number): Float32Array {
  const v = new Float32Array(center.length);
  for (let j = 0; j < center.length; j++) v[j] = center[j] + gauss(rng) * noise;
  return normalize(v);
}

/** Build a deterministic fixture bundle. Same `seed` yields identical output. */
export function buildStorageFixture(seed = 42): FixtureBundle {
  const rng = rngSeeded(seed);
  const centers = clusterCenters(rng, FIXTURE_NUM_CLUSTERS, FIXTURE_DIM);

  const notes: FixtureNote[] = [];
  const embeddings: Float32Array[] = [];
  const baseDate = new Date("2025-01-01T00:00:00Z").getTime();

  // 100 commit-like notes.
  for (let i = 0; i < FIXTURE_NUM_COMMITS; i++) {
    const c = i % FIXTURE_NUM_CLUSTERS;
    notes.push({
      filePath: `git://owner/repo/commit/${i}`,
      title: `commit ${i.toString().padStart(3, "0")}`,
      content:
        `Refactor module ${c}: typical commit body explaining the change. ` +
        `index=${i}, cluster=${c}. ` +
        "Lorem ipsum dolor sit amet consectetur. ".repeat(3),
      tags: ["commit", `cluster-${c}`],
      createdAt: new Date(baseDate + i * 60_000).toISOString(),
    });
    embeddings.push(noisyVector(centers[c], rng, FIXTURE_NOISE));
  }

  // 50 issue-like notes.
  for (let i = 0; i < FIXTURE_NUM_ISSUES; i++) {
    const c = i % FIXTURE_NUM_CLUSTERS;
    notes.push({
      filePath: `github://owner/repo/issues/${i}`,
      title: `Issue ${i}`,
      content:
        `Bug report or feature request for cluster ${c}. ` +
        `issue=${i}. ` +
        "An issue description with realistic length and detail. ".repeat(8),
      tags: ["issue", `cluster-${c}`, "open"],
      createdAt: new Date(baseDate + (FIXTURE_NUM_COMMITS + i) * 60_000).toISOString(),
    });
    embeddings.push(noisyVector(centers[c], rng, FIXTURE_NOISE));
  }

  return { notes, embeddings };
}

/** Build a query vector around one of the clusters used by `buildStorageFixture`. */
export function buildClusterQuery(seed: number, clusterIndex?: number): Float32Array {
  const rng = rngSeeded(seed);
  const centers = clusterCenters(rng, FIXTURE_NUM_CLUSTERS, FIXTURE_DIM);
  const c =
    clusterIndex !== undefined
      ? clusterIndex % FIXTURE_NUM_CLUSTERS
      : Math.abs(seed) % FIXTURE_NUM_CLUSTERS;
  return noisyVector(centers[c], rng, FIXTURE_NOISE);
}
