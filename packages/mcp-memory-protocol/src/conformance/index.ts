export type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
export { runStoreTests } from "./store.test-suite.js";
export { runRecallTests } from "./recall.test-suite.js";
export { runUpdateTests } from "./update.test-suite.js";
export { runForgetTests } from "./forget.test-suite.js";
export { runVersioningTests } from "./versioning.test-suite.js";
export { runErrorFormatTests } from "./error-format.test-suite.js";
export { runCapabilitiesTests } from "./capabilities.test-suite.js";

import type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
import { runStoreTests } from "./store.test-suite.js";
import { runRecallTests } from "./recall.test-suite.js";
import { runUpdateTests } from "./update.test-suite.js";
import { runForgetTests } from "./forget.test-suite.js";
import { runVersioningTests } from "./versioning.test-suite.js";
import { runErrorFormatTests } from "./error-format.test-suite.js";
import { runCapabilitiesTests } from "./capabilities.test-suite.js";

export interface ConformanceSuiteOptions {
  includeVersioning?: boolean;
  includeCapabilities?: boolean;
  /** Include error-format tests (default: true). Set false if your test suite already covers error formats independently. */
  includeErrorFormat?: boolean;
}

export async function runConformanceSuite(
  ctx: ConformanceTestContext,
  options: ConformanceSuiteOptions = {},
): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];
  results.push(...(await runStoreTests(ctx)));
  results.push(...(await runRecallTests(ctx)));
  results.push(...(await runUpdateTests(ctx)));
  results.push(...(await runForgetTests(ctx)));
  if (options.includeErrorFormat !== false) {
    results.push(...(await runErrorFormatTests(ctx)));
  }
  if (options.includeVersioning) {
    results.push(...(await runVersioningTests(ctx)));
  }
  if (options.includeCapabilities) {
    results.push(...(await runCapabilitiesTests(ctx)));
  }
  return results;
}
