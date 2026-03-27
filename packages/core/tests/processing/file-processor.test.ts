import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileProcessor } from "../../src/processing/file-processor.js";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("FileProcessor", () => {
  let processor: FileProcessor;
  let testDir: string;

  beforeEach(async () => {
    processor = new FileProcessor();
    testDir = await mkdtemp(join(tmpdir(), "knowledgine-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("processFile", () => {
    it("should read a real file and return ProcessedFile structure", async () => {
      const filePath = join(testDir, "test.md");
      await writeFile(
        filePath,
        "---\ntitle: My Note\ntags:\n  - typescript\n---\n# Test Title\n\nContent here.",
      );

      const result = await processor.processFile(filePath);
      expect(result.filePath).toBe(filePath);
      expect(result.rawContent).toContain("# Test Title");
      expect(result.content).toContain("# Test Title");
      expect(result.frontmatter).toBeDefined();
    });

    it("should throw error for non-existent file", async () => {
      await expect(processor.processFile("/nonexistent/path.md")).rejects.toThrow();
    });
  });

  describe("extractFrontMatter", () => {
    it("should extract valid YAML frontmatter", () => {
      const raw = "---\ntitle: Test\ntags:\n  - ts\n---\nContent here";
      const { frontmatter, content } = processor.extractFrontMatter(raw);
      expect(frontmatter["title"]).toBe("Test");
      expect(frontmatter["tags"] as string[]).toContain("ts");
      expect(content).toBe("Content here");
    });

    it("should return empty frontmatter and rawContent on invalid YAML", () => {
      const raw = "---\n: invalid: yaml: {\n---\nContent";
      const { frontmatter, content } = processor.extractFrontMatter(raw);
      expect(frontmatter).toEqual({});
      expect(content).toBe(raw);
    });

    it("should return empty frontmatter and rawContent when no frontmatter present", () => {
      const raw = "# Just a heading\n\nBody text here.";
      const { frontmatter, content } = processor.extractFrontMatter(raw);
      expect(frontmatter).toEqual({});
      expect(content).toBe(raw);
    });

    it("should handle empty string", () => {
      const { frontmatter, content } = processor.extractFrontMatter("");
      expect(frontmatter).toEqual({});
      expect(content).toBe("");
    });
  });

  describe("extractTitle", () => {
    it("should return H1 heading text when present", () => {
      const content = "# My Title\n\nSome content";
      const title = processor.extractTitle(content, "somefile.md");
      expect(title).toBe("My Title");
    });

    it("should return filename without .md when no H1", () => {
      const content = "No heading here\nJust body text";
      const title = processor.extractTitle(content, "/path/to/my-note.md");
      expect(title).toBe("my-note");
    });

    it("should return first H1 when multiple H1 headings exist", () => {
      const content = "# First Heading\n\nText\n\n# Second Heading";
      const title = processor.extractTitle(content, "test.md");
      expect(title).toBe("First Heading");
    });

    it("should trim whitespace from heading text", () => {
      const content = "#   Padded Title   \n\nBody";
      const title = processor.extractTitle(content, "test.md");
      expect(title).toBe("Padded Title");
    });
  });
});
