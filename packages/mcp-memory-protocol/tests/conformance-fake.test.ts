// Smoke test for the new MemoryProvider-based conformance harness.
// Drives the bundled FakeInMemoryProvider through the full required-suite
// plus the versioning capability suite. Failure here means the conformance
// kit itself is broken; failure on real providers means the provider is.

import { runConformanceSuite } from "../src/conformance/index.js";
import { FakeInMemoryProvider } from "./fake-provider.js";

runConformanceSuite({
  createProvider: () => new FakeInMemoryProvider(),
});
