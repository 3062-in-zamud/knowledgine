import { describe, it, expect, beforeEach } from "vitest";
import { CodeBlockDetector } from "../../src/utils/code-block-detector.js";
import type { CodeBlockRange } from "../../src/utils/code-block-detector.js";

describe("CodeBlockDetector", () => {
  let detector: CodeBlockDetector;

  beforeEach(() => {
    detector = new CodeBlockDetector();
  });

  describe("detectCodeBlocks", () => {
    it("should detect code block with language specified", () => {
      const content = "```typescript\nconst x = 1;\n```";
      const blocks = detector.detectCodeBlocks(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe("typescript");
      expect(blocks[0].type).toBe("fenced");
      expect(blocks[0].startLine).toBe(0);
      expect(blocks[0].endLine).toBe(2);
    });

    it("should detect code block without language", () => {
      const content = "```\nsome code\n```";
      const blocks = detector.detectCodeBlocks(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBeUndefined();
      expect(blocks[0].type).toBe("fenced");
    });

    it("should detect multiple code blocks", () => {
      const content = "```js\ncode1\n```\nsome text\n```python\ncode2\n```";
      const blocks = detector.detectCodeBlocks(content);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].language).toBe("js");
      expect(blocks[1].language).toBe("python");
    });

    it("should extend unclosed block to end of content", () => {
      const content = "```ts\nconst x = 1;\nconst y = 2;";
      const blocks = detector.detectCodeBlocks(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].startLine).toBe(0);
      expect(blocks[0].endLine).toBe(2); // last line index
    });

    it("should return empty array for empty string", () => {
      const blocks = detector.detectCodeBlocks("");
      expect(blocks).toHaveLength(0);
    });

    it("should return empty array when no code blocks", () => {
      const content = "This is plain text\nwithout code blocks";
      const blocks = detector.detectCodeBlocks(content);
      expect(blocks).toHaveLength(0);
    });
  });

  describe("isInCodeBlock", () => {
    let codeBlocks: CodeBlockRange[];

    beforeEach(() => {
      codeBlocks = [{ startLine: 2, endLine: 5, language: "ts", type: "fenced" }];
    });

    it("should return true when line is inside a code block", () => {
      expect(detector.isInCodeBlock(3, codeBlocks)).toBe(true);
    });

    it("should return false when line is outside a code block", () => {
      expect(detector.isInCodeBlock(0, codeBlocks)).toBe(false);
      expect(detector.isInCodeBlock(7, codeBlocks)).toBe(false);
    });

    it("should return true on the start line of a code block", () => {
      expect(detector.isInCodeBlock(2, codeBlocks)).toBe(true);
    });

    it("should return true on the end line of a code block", () => {
      expect(detector.isInCodeBlock(5, codeBlocks)).toBe(true);
    });

    it("should return false for empty code blocks array", () => {
      expect(detector.isInCodeBlock(0, [])).toBe(false);
    });
  });

  describe("hasInlineCode", () => {
    it("should return true when line has inline code", () => {
      expect(detector.hasInlineCode("Use `const` for constants")).toBe(true);
    });

    it("should return false when line has no inline code", () => {
      expect(detector.hasInlineCode("Plain text without code")).toBe(false);
    });

    it("should handle nested backticks (triple backticks)", () => {
      // Triple backticks should not match as inline code
      expect(detector.hasInlineCode("```fenced block```")).toBe(false);
    });
  });

  describe("removeInlineCode", () => {
    it("should remove inline code from line", () => {
      const result = detector.removeInlineCode("Use `const` for constants");
      expect(result).toBe("Use  for constants");
    });

    it("should return unchanged line when no inline code", () => {
      const line = "Plain text without code";
      expect(detector.removeInlineCode(line)).toBe(line);
    });
  });

  describe("filterNonCodeLines", () => {
    it("should exclude lines inside code blocks and preserve originalLineNumber", () => {
      const lines = ["text0", "text1", "```ts", "code", "```", "text5"];
      const codeBlocks = detector.detectCodeBlocks(lines.join("\n"));
      const result = detector.filterNonCodeLines(lines, codeBlocks);

      // Lines 2, 3, 4 are part of code block
      expect(result.every((r) => ![2, 3, 4].includes(r.originalLineNumber))).toBe(true);
      expect(result.find((r) => r.originalLineNumber === 0)?.line).toBe("text0");
      expect(result.find((r) => r.originalLineNumber === 5)?.line).toBe("text5");
    });

    it("should preserve originalLineNumber correctly", () => {
      const lines = ["line0", "line1", "line2"];
      const result = detector.filterNonCodeLines(lines, []);
      expect(result[0].originalLineNumber).toBe(0);
      expect(result[1].originalLineNumber).toBe(1);
      expect(result[2].originalLineNumber).toBe(2);
    });
  });

  describe("getCodeBlockStats", () => {
    it("should return correct totalCodeBlocks, totalCodeLines, and languages", () => {
      const content = "```typescript\nline1\nline2\n```\n```javascript\nline1\n```";
      const stats = detector.getCodeBlockStats(content);
      expect(stats.totalCodeBlocks).toBe(2);
      expect(stats.languages["typescript"]).toBe(1);
      expect(stats.languages["javascript"]).toBe(1);
      expect(stats.totalCodeLines).toBeGreaterThan(0);
    });

    it('should use "unknown" for code blocks without language', () => {
      const content = "```\nsome code\n```";
      const stats = detector.getCodeBlockStats(content);
      expect(stats.languages["unknown"]).toBe(1);
    });
  });
});
