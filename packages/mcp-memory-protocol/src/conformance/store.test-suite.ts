import type { ConformanceTestContext, ConformanceResult } from "./helpers.js";
import { callTool, makeResult } from "./helpers.js";

export async function runStoreTests(ctx: ConformanceTestContext): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  // store_memory: basic success
  try {
    const r = await callTool(ctx.client, "store_memory", {
      content: "Test memory entry",
      layer: "episodic",
    });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    if (!d.id || typeof d.id !== "string") throw new Error("Response missing string id");
    if (d.layer !== "episodic") throw new Error(`Expected layer=episodic, got ${String(d.layer)}`);
    if (d.version !== 1) throw new Error(`Expected version=1, got ${String(d.version)}`);
    if (!d.createdAt || typeof d.createdAt !== "string") throw new Error("Missing createdAt");
    results.push(makeResult("store_memory: basic success", true));
  } catch (e) {
    results.push(makeResult("store_memory: basic success", false, String(e)));
  }

  // store_memory: defaults layer to episodic
  try {
    const r = await callTool(ctx.client, "store_memory", { content: "No layer specified" });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    if (d.layer !== "episodic")
      throw new Error(`Expected default layer=episodic, got ${String(d.layer)}`);
    results.push(makeResult("store_memory: defaults to episodic layer", true));
  } catch (e) {
    results.push(makeResult("store_memory: defaults to episodic layer", false, String(e)));
  }

  // store_memory: INVALID_CONTENT for empty string
  try {
    const r = await callTool(ctx.client, "store_memory", { content: "" });
    if (!r.isError) throw new Error("Expected error for empty content");
    if (!r.text.includes("INVALID_CONTENT"))
      throw new Error(`Expected INVALID_CONTENT in error, got: ${r.text}`);
    results.push(makeResult("store_memory: INVALID_CONTENT for empty content", true));
  } catch (e) {
    results.push(makeResult("store_memory: INVALID_CONTENT for empty content", false, String(e)));
  }

  // store_memory: INVALID_LAYER for bad layer value
  try {
    const r = await callTool(ctx.client, "store_memory", {
      content: "test",
      layer: "invalid_layer",
    });
    if (!r.isError) throw new Error("Expected error for invalid layer");
    if (!r.text.includes("INVALID_LAYER"))
      throw new Error(`Expected INVALID_LAYER in error, got: ${r.text}`);
    results.push(makeResult("store_memory: INVALID_LAYER for bad layer", true));
  } catch (e) {
    results.push(makeResult("store_memory: INVALID_LAYER for bad layer", false, String(e)));
  }

  // store_memory: with tags and metadata
  try {
    const r = await callTool(ctx.client, "store_memory", {
      content: "Memory with tags",
      tags: ["tag1", "tag2"],
      metadata: { source: "test", project: "conformance" },
    });
    if (r.isError) throw new Error(`Unexpected error: ${r.text}`);
    const d = r.data as Record<string, unknown>;
    if (!d.id) throw new Error("Missing id in response");
    results.push(makeResult("store_memory: with tags and metadata", true));
  } catch (e) {
    results.push(makeResult("store_memory: with tags and metadata", false, String(e)));
  }

  return results;
}
