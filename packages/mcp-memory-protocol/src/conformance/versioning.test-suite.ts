// Optional capability: versioning (createVersion: true)
import type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
import { callTool, makeResult } from "./helpers.js";

export async function runVersioningTests(
  ctx: ConformanceTestContext,
): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  // Seed a memory to version
  let seedId: string | undefined;
  let seedVersion: number | undefined;
  try {
    const r = await callTool(ctx.client, "store_memory", {
      content: "Original content for versioning test",
      layer: "episodic",
    });
    const d = r.data as Record<string, unknown>;
    seedId = d.id as string;
    seedVersion = d.version as number;
  } catch {
    // will fail in later tests
  }

  // update_memory: createVersion=true creates new entry
  if (seedId && seedVersion !== undefined) {
    try {
      const r = await callTool(ctx.client, "update_memory", {
        id: seedId,
        content: "Updated versioned content",
        createVersion: true,
      });
      if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
      const d = r.data as Record<string, unknown>;
      const newId = d.id as string;
      const newVersion = d.version as number;
      const prevVersion = d.previousVersion as number;
      if (newId === seedId) throw new Error("New version should have a different id");
      if (newVersion !== seedVersion + 1)
        throw new Error(`Expected version=${seedVersion + 1}, got ${newVersion}`);
      if (prevVersion !== seedVersion)
        throw new Error(`Expected previousVersion=${seedVersion}, got ${prevVersion}`);
      results.push(makeResult("versioning: update creates new id with incremented version", true));
    } catch (e) {
      results.push(
        makeResult("versioning: update creates new id with incremented version", false, String(e)),
      );
    }
  }

  // recall_memory: includeVersionHistory=false excludes deprecated by default
  if (seedId) {
    try {
      const r = await callTool(ctx.client, "recall_memory", {
        filter: { memoryIds: [seedId] },
        includeVersionHistory: false,
      });
      if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
      const d = r.data as Record<string, unknown>;
      const memories = d.memories as Array<Record<string, unknown>>;
      const deprecated = memories.filter((m) => m.deprecated === true);
      if (deprecated.length > 0)
        throw new Error("Deprecated entries should be excluded by default");
      results.push(makeResult("versioning: includeVersionHistory=false excludes deprecated", true));
    } catch (e) {
      results.push(
        makeResult("versioning: includeVersionHistory=false excludes deprecated", false, String(e)),
      );
    }
  }

  return results;
}
