// Conformance test helpers — MemoryProvider-based (Provider direct injection).
// vitest-compatible. The conformance suite issues describe()/it()/beforeEach()
// from vitest, so consumers must run the suite under vitest. README explains
// Jest conversion.

import type { MemoryProvider } from "../provider.js";
import type { MemoryProviderCapabilities } from "../types.js";

/**
 * Capability keys that gate optional test suites. Names match
 * `MemoryProviderCapabilities` keys (camelCase).
 */
export type SkippableCapability =
  | "versioning"
  | "temporalQuery"
  | "ttl"
  | "semanticSearch"
  | "layerPromotion";

export interface RunConformanceOptions {
  /**
   * Factory that returns a fresh provider instance. Called from `beforeEach`
   * of every spec so that tests are isolated and state-free. May be sync or
   * async.
   */
  createProvider: () => Promise<MemoryProvider> | MemoryProvider;

  /**
   * Optional teardown hook called from `afterEach` with the provider returned
   * by `createProvider`. Use for closing DB handles, removing temp files etc.
   */
  teardown?: (provider: MemoryProvider) => Promise<void> | void;

  /**
   * Capabilities to explicitly skip even when the provider declares them
   * truthy. Useful when a backend is mid-implementation. Capability values
   * declared `false` by `provider.capabilities()` are skipped automatically;
   * this option lets callers force-skip otherwise.
   */
  skip?: SkippableCapability[];
}

/**
 * Determine whether a given capability test-suite should run for the supplied
 * provider+options pair. The capability must be declared truthy by the
 * provider AND not appear in the user-provided skip list.
 */
export function shouldRunCapability(
  caps: MemoryProviderCapabilities,
  options: RunConformanceOptions,
  capability: SkippableCapability,
): boolean {
  if (options.skip?.includes(capability)) return false;
  return Boolean(caps[capability]);
}
