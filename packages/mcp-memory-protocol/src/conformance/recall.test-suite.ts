import type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
import { callTool, makeResult } from "./helpers.js";

export async function runRecallTests(ctx: ConformanceTestContext): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  // Seed a memory first
  let seedId: string | undefined;
  try {
    const r = await callTool(ctx.client, "store_memory", {
      content: "Recall conformance test seed",
      layer: "episodic",
      tags: ["conformance"],
    });
    seedId = (r.data as Record<string, unknown>).id as string;
  } catch {
    // will fail in later tests
  }

  // recall_memory: no query returns memories array
  try {
    const r = await callTool(ctx.client, "recall_memory", {});
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    if (!Array.isArray(d.memories)) throw new Error("Response missing memories array");
    if (typeof d.totalCount !== "number") throw new Error("Missing totalCount");
    if (typeof d.hasMore !== "boolean") throw new Error("Missing hasMore");
    results.push(makeResult("recall_memory: returns memories/totalCount/hasMore", true));
  } catch (e) {
    results.push(
      makeResult("recall_memory: returns memories/totalCount/hasMore", false, String(e)),
    );
  }

  // recall_memory: with query
  try {
    const r = await callTool(ctx.client, "recall_memory", { query: "conformance test seed" });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    if (!Array.isArray(d.memories)) throw new Error("Missing memories array");
    results.push(makeResult("recall_memory: with query", true));
  } catch (e) {
    results.push(makeResult("recall_memory: with query", false, String(e)));
  }

  // recall_memory: each memory has required fields
  try {
    const r = await callTool(ctx.client, "recall_memory", { query: "conformance test seed" });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    const memories = d.memories as Array<Record<string, unknown>>;
    if (memories.length === 0) throw new Error("Expected at least one result");
    const m = memories[0];
    if (!m.id || typeof m.id !== "string") throw new Error("Missing string id");
    if (!m.content || typeof m.content !== "string") throw new Error("Missing content");
    if (!m.layer) throw new Error("Missing layer");
    if (typeof m.version !== "number") throw new Error("Missing version");
    if (typeof m.accessCount !== "number") throw new Error("Missing accessCount");
    if (!Array.isArray(m.tags)) throw new Error("Missing tags array");
    if (!m.createdAt) throw new Error("Missing createdAt");
    results.push(makeResult("recall_memory: memory has required fields", true));
  } catch (e) {
    results.push(makeResult("recall_memory: memory has required fields", false, String(e)));
  }

  // recall_memory: filter by layer
  try {
    const r = await callTool(ctx.client, "recall_memory", {
      filter: { layer: "episodic" },
    });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    const memories = d.memories as Array<Record<string, unknown>>;
    for (const m of memories) {
      if (m.layer !== "episodic") throw new Error(`Expected episodic, got ${String(m.layer)}`);
    }
    results.push(makeResult("recall_memory: filter by layer", true));
  } catch (e) {
    results.push(makeResult("recall_memory: filter by layer", false, String(e)));
  }

  // recall_memory: limit respected
  try {
    const r = await callTool(ctx.client, "recall_memory", { limit: 1 });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    const memories = d.memories as unknown[];
    if (memories.length > 1) throw new Error(`Expected at most 1 result, got ${memories.length}`);
    results.push(makeResult("recall_memory: limit respected", true));
  } catch (e) {
    results.push(makeResult("recall_memory: limit respected", false, String(e)));
  }

  // recall_memory: accessCount incremented on recall (SHOULD)
  if (seedId) {
    try {
      const r1 = await callTool(ctx.client, "recall_memory", {
        filter: { memoryIds: [seedId] },
      });
      const before = (
        (r1.data as Record<string, unknown>).memories as Array<Record<string, unknown>>
      )[0]?.accessCount as number;
      await callTool(ctx.client, "recall_memory", { filter: { memoryIds: [seedId] } });
      const r2 = await callTool(ctx.client, "recall_memory", {
        filter: { memoryIds: [seedId] },
      });
      const after = (
        (r2.data as Record<string, unknown>).memories as Array<Record<string, unknown>>
      )[0]?.accessCount as number;
      if (after <= before)
        throw new Error(`accessCount not incremented: before=${before}, after=${after}`);
      results.push(makeResult("recall_memory: accessCount incremented (SHOULD)", true));
    } catch (e) {
      results.push(makeResult("recall_memory: accessCount incremented (SHOULD)", false, String(e)));
    }
  }

  return results;
}
