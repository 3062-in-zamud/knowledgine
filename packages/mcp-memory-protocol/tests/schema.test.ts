import { describe, it, expect } from "vitest";
import {
  MemoryStoreRequestSchema,
  MemoryRecallRequestSchema,
  MemoryUpdateRequestSchema,
  MemoryForgetRequestSchema,
  MemoryLayerSchema,
} from "../src/schema.js";

describe("MemoryLayerSchema", () => {
  it("accepts valid layers", () => {
    expect(MemoryLayerSchema.parse("episodic")).toBe("episodic");
    expect(MemoryLayerSchema.parse("semantic")).toBe("semantic");
    expect(MemoryLayerSchema.parse("procedural")).toBe("procedural");
  });

  it("rejects invalid layer", () => {
    expect(() => MemoryLayerSchema.parse("invalid")).toThrow();
    expect(() => MemoryLayerSchema.parse("")).toThrow();
    expect(() => MemoryLayerSchema.parse(null)).toThrow();
  });
});

describe("MemoryStoreRequestSchema", () => {
  it("accepts minimal valid input", () => {
    const result = MemoryStoreRequestSchema.parse({ content: "hello" });
    expect(result.content).toBe("hello");
    expect(result.layer).toBeUndefined();
  });

  it("accepts full valid input", () => {
    const result = MemoryStoreRequestSchema.parse({
      content: "test",
      layer: "semantic",
      tags: ["a", "b"],
      ttl: 3600,
      metadata: { source: "test", project: "proj1" },
    });
    expect(result.layer).toBe("semantic");
    expect(result.tags).toEqual(["a", "b"]);
    expect(result.ttl).toBe(3600);
  });

  it("rejects empty content", () => {
    expect(() => MemoryStoreRequestSchema.parse({ content: "" })).toThrow();
  });

  it("rejects missing content", () => {
    expect(() => MemoryStoreRequestSchema.parse({})).toThrow();
  });

  it("rejects invalid layer", () => {
    expect(() => MemoryStoreRequestSchema.parse({ content: "test", layer: "bad" })).toThrow();
  });

  it("rejects non-positive ttl", () => {
    expect(() => MemoryStoreRequestSchema.parse({ content: "test", ttl: 0 })).toThrow();
    expect(() => MemoryStoreRequestSchema.parse({ content: "test", ttl: -1 })).toThrow();
  });
});

describe("MemoryRecallRequestSchema", () => {
  it("accepts empty object", () => {
    const result = MemoryRecallRequestSchema.parse({});
    expect(result.query).toBeUndefined();
    expect(result.limit).toBeUndefined();
  });

  it("accepts full valid input", () => {
    const result = MemoryRecallRequestSchema.parse({
      query: "search term",
      limit: 20,
      filter: { layer: "semantic", tags: ["tag1"] },
      includeVersionHistory: true,
    });
    expect(result.query).toBe("search term");
    expect(result.limit).toBe(20);
    expect(result.filter?.layer).toBe("semantic");
  });

  it("rejects limit over 100", () => {
    expect(() => MemoryRecallRequestSchema.parse({ limit: 101 })).toThrow();
  });

  it("rejects limit less than 1", () => {
    expect(() => MemoryRecallRequestSchema.parse({ limit: 0 })).toThrow();
  });

  it("accepts asOf for temporal query", () => {
    const result = MemoryRecallRequestSchema.parse({
      asOf: "2026-01-01T00:00:00Z",
    });
    expect(result.asOf).toBe("2026-01-01T00:00:00Z");
  });
});

describe("MemoryUpdateRequestSchema", () => {
  it("accepts minimal valid input", () => {
    const result = MemoryUpdateRequestSchema.parse({ id: "mem_123" });
    expect(result.id).toBe("mem_123");
  });

  it("accepts full valid input", () => {
    const result = MemoryUpdateRequestSchema.parse({
      id: "mem_123",
      content: "new content",
      summary: "new summary",
      tags: ["x"],
      createVersion: true,
    });
    expect(result.createVersion).toBe(true);
  });

  it("rejects empty id", () => {
    expect(() => MemoryUpdateRequestSchema.parse({ id: "" })).toThrow();
  });

  it("rejects missing id", () => {
    expect(() => MemoryUpdateRequestSchema.parse({})).toThrow();
  });

  it("rejects empty content when provided", () => {
    expect(() => MemoryUpdateRequestSchema.parse({ id: "mem_1", content: "" })).toThrow();
  });
});

describe("MemoryForgetRequestSchema", () => {
  it("accepts minimal valid input", () => {
    const result = MemoryForgetRequestSchema.parse({ id: "mem_123" });
    expect(result.id).toBe("mem_123");
    expect(result.hard).toBeUndefined();
  });

  it("accepts hard=true", () => {
    const result = MemoryForgetRequestSchema.parse({ id: "mem_1", hard: true });
    expect(result.hard).toBe(true);
  });

  it("accepts reason", () => {
    const result = MemoryForgetRequestSchema.parse({ id: "mem_1", reason: "outdated" });
    expect(result.reason).toBe("outdated");
  });

  it("rejects empty id", () => {
    expect(() => MemoryForgetRequestSchema.parse({ id: "" })).toThrow();
  });

  it("rejects missing id", () => {
    expect(() => MemoryForgetRequestSchema.parse({})).toThrow();
  });
});
