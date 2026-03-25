import type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
import { callTool, makeResult } from "./helpers.js";

export async function runUpdateTests(ctx: ConformanceTestContext): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  // Seed a memory to update
  let seedId: string | undefined;
  try {
    const r = await callTool(ctx.client, "store_memory", {
      content: "Original content for update test",
      layer: "episodic",
    });
    seedId = (r.data as Record<string, unknown>).id as string;
  } catch {
    // will fail in later tests
  }

  // update_memory: in-place update (createVersion: false)
  if (seedId) {
    try {
      const r = await callTool(ctx.client, "update_memory", {
        id: seedId,
        content: "Updated content",
        createVersion: false,
      });
      if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
      const d = r.data as Record<string, unknown>;
      if (!d.id || typeof d.id !== "string") throw new Error("Missing id");
      if (typeof d.version !== "number") throw new Error("Missing version");
      if (!d.updatedAt || typeof d.updatedAt !== "string") throw new Error("Missing updatedAt");
      results.push(makeResult("update_memory: in-place update (createVersion: false)", true));
    } catch (e) {
      results.push(
        makeResult("update_memory: in-place update (createVersion: false)", false, String(e)),
      );
    }
  }

  // update_memory: MEMORY_NOT_FOUND for non-existent id
  try {
    const r = await callTool(ctx.client, "update_memory", {
      id: "non-existent-id-xyz",
      content: "updated",
    });
    if (!r.isError) throw new Error("Expected error for non-existent id");
    if (!r.text.includes("MEMORY_NOT_FOUND"))
      throw new Error(`Expected MEMORY_NOT_FOUND, got: ${r.text}`);
    results.push(makeResult("update_memory: MEMORY_NOT_FOUND for non-existent id", true));
  } catch (e) {
    results.push(
      makeResult("update_memory: MEMORY_NOT_FOUND for non-existent id", false, String(e)),
    );
  }

  return results;
}
