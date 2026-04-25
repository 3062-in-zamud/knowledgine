import { describe, it, expect } from "vitest";
import { extractTextContent } from "../../src/shared/text-extractor.js";

describe("extractTextContent", () => {
  it("should return string as-is", () => {
    expect(extractTextContent("hello world")).toBe("hello world");
  });

  it("should extract text blocks from array", () => {
    const content = [
      { type: "text", text: "Hello " },
      { type: "text", text: "World" },
    ];
    expect(extractTextContent(content)).toBe("Hello World");
  });

  it("should skip non-text blocks (tool_use, tool_result)", () => {
    const content = [
      { type: "text", text: "Before" },
      { type: "tool_use", text: "should be ignored" },
      { type: "tool_result", text: "also ignored" },
      { type: "text", text: " After" },
    ];
    expect(extractTextContent(content)).toBe("Before After");
  });

  it("should skip thinking blocks", () => {
    const content = [
      { type: "thinking", text: "internal thought" },
      { type: "text", text: "Visible text" },
    ];
    expect(extractTextContent(content)).toBe("Visible text");
  });

  it("should return empty string when all blocks are non-text (thinking only)", () => {
    const content = [{ type: "thinking", text: "internal" }, { type: "tool_use" }];
    expect(extractTextContent(content)).toBe("");
  });

  it("should handle mixed array with null and numbers", () => {
    const content = [
      null,
      42,
      { type: "text", text: "valid" },
      { type: "thinking" },
    ] as unknown as Array<{ type: string; text?: string }>;
    expect(extractTextContent(content)).toBe("valid");
  });

  it("should return empty string for empty array", () => {
    expect(extractTextContent([])).toBe("");
  });

  it("should return empty string for unsupported types (objects, null, undefined)", () => {
    expect(extractTextContent(null as unknown as string)).toBe("");
    expect(extractTextContent(undefined as unknown as string)).toBe("");
    expect(extractTextContent({} as unknown as string)).toBe("");
    expect(extractTextContent(123 as unknown as string)).toBe("");
  });

  it("should drop blocks that lack a string text field", () => {
    const content = [
      { type: "text" },
      { type: "text", text: 42 },
      { type: "text", text: "ok" },
    ] as unknown as Array<{ type: string; text?: string }>;
    expect(extractTextContent(content)).toBe("ok");
  });
});
