import type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
import { callTool, makeResult } from "./helpers.js";

export async function runErrorFormatTests(
  ctx: ConformanceTestContext,
): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  // Error format: MEMORY_NOT_FOUND returns isError: true
  try {
    const r = await callTool(ctx.client, "forget_memory", { id: "nonexistent-id-for-conformance" });
    if (!r.isError) throw new Error("Expected isError: true for MEMORY_NOT_FOUND");
    results.push(makeResult("error format: MEMORY_NOT_FOUND returns isError: true", true));
  } catch (e) {
    results.push(
      makeResult("error format: MEMORY_NOT_FOUND returns isError: true", false, String(e)),
    );
  }

  // Error format: error code is present in text content
  try {
    const r = await callTool(ctx.client, "forget_memory", { id: "nonexistent-id-for-conformance" });
    if (!r.isError) throw new Error("Expected error response");
    if (!r.text.includes("MEMORY_NOT_FOUND"))
      throw new Error(`Expected error code in text, got: ${r.text}`);
    results.push(makeResult("error format: error code present in text content", true));
  } catch (e) {
    results.push(makeResult("error format: error code present in text content", false, String(e)));
  }

  // Error format: INVALID_CONTENT returns isError: true
  try {
    const r = await callTool(ctx.client, "store_memory", { content: "" });
    if (!r.isError) throw new Error("Expected isError: true for INVALID_CONTENT");
    if (!r.text.includes("INVALID_CONTENT"))
      throw new Error(`Expected INVALID_CONTENT code in text, got: ${r.text}`);
    results.push(makeResult("error format: INVALID_CONTENT returns isError: true", true));
  } catch (e) {
    results.push(
      makeResult("error format: INVALID_CONTENT returns isError: true", false, String(e)),
    );
  }

  return results;
}
