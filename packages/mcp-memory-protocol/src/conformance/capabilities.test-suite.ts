import type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
import { callTool, makeResult } from "./helpers.js";

export async function runCapabilitiesTests(
  ctx: ConformanceTestContext,
): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  // get_memory_capabilities: tool exists and returns valid structure
  try {
    const r = await callTool(ctx.client, "get_memory_capabilities", {});
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    if (typeof d.versioning !== "boolean")
      throw new Error(`Expected boolean versioning, got: ${typeof d.versioning}`);
    if (typeof d.semanticSearch !== "boolean")
      throw new Error(`Expected boolean semanticSearch, got: ${typeof d.semanticSearch}`);
    if (typeof d.layerPromotion !== "boolean")
      throw new Error(`Expected boolean layerPromotion, got: ${typeof d.layerPromotion}`);
    if (typeof d.temporalQuery !== "boolean")
      throw new Error(`Expected boolean temporalQuery, got: ${typeof d.temporalQuery}`);
    if (typeof d.ttl !== "boolean") throw new Error(`Expected boolean ttl, got: ${typeof d.ttl}`);
    if (!Array.isArray(d.supportedLayers)) throw new Error("Expected array supportedLayers");
    results.push(makeResult("get_memory_capabilities: returns valid capability structure", true));
  } catch (e) {
    results.push(
      makeResult("get_memory_capabilities: returns valid capability structure", false, String(e)),
    );
  }

  return results;
}
