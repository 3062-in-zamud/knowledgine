import v8 from "v8";

/**
 * Returns the ratio of heap used to heap size limit (0.0 – 1.0).
 */
export function getHeapUsageRatio(): number {
  const stats = v8.getHeapStatistics();
  return stats.used_heap_size / stats.heap_size_limit;
}

/**
 * Returns an adaptive batch size based on current heap pressure.
 *
 * - Below 80%: returns `defaultSize` unchanged
 * - 80-90%: halves the batch size
 * - Above 90%: quarters the batch size
 *
 * Always returns at least 1.
 */
export function getAdaptiveBatchSize(defaultSize: number, heapRatio?: number): number {
  const ratio = heapRatio ?? getHeapUsageRatio();

  if (ratio > 0.9) {
    return Math.max(1, Math.floor(defaultSize / 4));
  }
  if (ratio > 0.8) {
    return Math.max(1, Math.floor(defaultSize / 2));
  }
  return defaultSize;
}
