import type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
import { callTool, makeResult } from "./helpers.js";

export async function runForgetTests(ctx: ConformanceTestContext): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  // forget_memory: soft delete (default)
  try {
    const storeR = await callTool(ctx.client, "store_memory", {
      content: "Memory to soft-forget",
      layer: "episodic",
    });
    const id = (storeR.data as Record<string, unknown>).id as string;

    const r = await callTool(ctx.client, "forget_memory", { id, reason: "test soft forget" });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    if (d.id !== id) throw new Error(`Expected id=${id}, got ${String(d.id)}`);
    if (d.forgotten !== true) throw new Error("Expected forgotten=true");
    if (d.method !== "soft") throw new Error(`Expected method=soft, got ${String(d.method)}`);
    results.push(makeResult("forget_memory: soft delete success", true));
  } catch (e) {
    results.push(makeResult("forget_memory: soft delete success", false, String(e)));
  }

  // forget_memory: hard delete
  try {
    const storeR = await callTool(ctx.client, "store_memory", {
      content: "Memory to hard-forget",
      layer: "episodic",
    });
    const id = (storeR.data as Record<string, unknown>).id as string;

    const r = await callTool(ctx.client, "forget_memory", { id, hard: true });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    if (d.forgotten !== true) throw new Error("Expected forgotten=true");
    if (d.method !== "hard") throw new Error(`Expected method=hard, got ${String(d.method)}`);
    results.push(makeResult("forget_memory: hard delete success", true));
  } catch (e) {
    results.push(makeResult("forget_memory: hard delete success", false, String(e)));
  }

  // forget_memory: MEMORY_NOT_FOUND
  try {
    const r = await callTool(ctx.client, "forget_memory", { id: "non-existent-id-xyz" });
    if (!r.isError) throw new Error("Expected error for non-existent id");
    if (!r.text.includes("MEMORY_NOT_FOUND"))
      throw new Error(`Expected MEMORY_NOT_FOUND, got: ${r.text}`);
    results.push(makeResult("forget_memory: MEMORY_NOT_FOUND for non-existent id", true));
  } catch (e) {
    results.push(
      makeResult("forget_memory: MEMORY_NOT_FOUND for non-existent id", false, String(e)),
    );
  }

  return results;
}
