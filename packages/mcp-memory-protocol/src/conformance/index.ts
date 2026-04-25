// Public conformance API — Provider-injection-based.
//
// Consumers register the suite once per spec file:
//
//   import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol/conformance";
//   runConformanceSuite({
//     createProvider: () => new MyProvider(),
//     teardown: (p) => p.close(),
//   });
//
// The suite registers vitest `describe`/`it`/`beforeEach`/`afterEach` blocks
// for the four required operations plus optional capability suites. Optional
// suites self-gate via `provider.capabilities()` and the `skip` option, so
// they no-op transparently for providers that don't declare the capability.
// README explains how to convert to Jest if needed.

import { registerStoreTests } from "./store.test-suite.js";
import { registerRecallTests } from "./recall.test-suite.js";
import { registerUpdateTests } from "./update.test-suite.js";
import { registerForgetTests } from "./forget.test-suite.js";
import { registerVersioningTests } from "./versioning.test-suite.js";
import { registerErrorFormatTests } from "./error-format.test-suite.js";
import { registerCapabilitiesTests } from "./capabilities.test-suite.js";

export type { RunConformanceOptions, SkippableCapability } from "./helpers.js";
export { shouldRunCapability } from "./helpers.js";

export function runConformanceSuite(options: import("./helpers.js").RunConformanceOptions): void {
  // Required operations — every compliant provider must implement these.
  registerStoreTests(options);
  registerRecallTests(options);
  registerUpdateTests(options);
  registerForgetTests(options);
  registerErrorFormatTests(options);
  registerCapabilitiesTests(options);

  // Optional capabilities — each suite self-gates on `provider.capabilities()`
  // and `options.skip`. PR 3 will add registerTemporalQueryTests +
  // registerTtlTests once the knowledgine adapter implements §8.2 / §9.2.
  registerVersioningTests(options);
}
