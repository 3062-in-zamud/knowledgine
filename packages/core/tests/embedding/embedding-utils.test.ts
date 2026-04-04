import { describe, it, expect } from "vitest";
import { buildEmbeddingInput } from "../../src/embedding/embedding-utils.js";

describe("buildEmbeddingInput", () => {
  it("prefixes content with shortened file path", () => {
    const result = buildEmbeddingInput({
      file_path: "packages/core/src/graph/entity-extractor.ts",
      title: "Entity Extraction",
      content: "Extract entities from text",
    });
    expect(result).toContain("[src/graph/entity-extractor.ts]");
    expect(result).toContain("Entity Extraction");
    expect(result).toContain("Extract entities from text");
  });

  it("produces different output for same-name files with different paths", () => {
    const note1 = { file_path: "packages/core/CLAUDE.md", title: "CLAUDE", content: "same" };
    const note2 = { file_path: "packages/cli/CLAUDE.md", title: "CLAUDE", content: "same" };
    expect(buildEmbeddingInput(note1)).not.toBe(buildEmbeddingInput(note2));
  });

  it("handles empty file_path gracefully", () => {
    const result = buildEmbeddingInput({ file_path: "", title: "Title", content: "Content" });
    expect(result).toBe("Title\nContent");
  });

  it("handles undefined file_path", () => {
    const result = buildEmbeddingInput({ title: "Title", content: "Content" });
    expect(result).toBe("Title\nContent");
  });

  it("normalizes Windows backslash paths", () => {
    const result = buildEmbeddingInput({
      file_path: "packages\\core\\CLAUDE.md",
      title: "Test",
      content: "Content",
    });
    expect(result).toContain("[packages/core/CLAUDE.md]");
    expect(result).not.toContain("\\");
  });

  it("shortens long paths to last 3 segments", () => {
    const result = buildEmbeddingInput({
      file_path: "a/b/c/d/e/f.ts",
      title: "Test",
      content: "Content",
    });
    expect(result).toMatch(/^\[d\/e\/f\.ts\]/);
  });
});
