import { describe, it, expect } from "vitest";
import {
  parseObsidianFrontmatter,
  extractInlineTags,
} from "../../../src/plugins/obsidian/frontmatter-parser.js";

describe("parseObsidianFrontmatter", () => {
  it("parses tags as array", () => {
    const result = parseObsidianFrontmatter({
      tags: ["tag1", "tag2"],
    });
    expect(result.tags).toEqual(["tag1", "tag2"]);
  });

  it("parses tags as comma-separated string", () => {
    const result = parseObsidianFrontmatter({
      tags: "tag1, tag2, tag3",
    });
    expect(result.tags).toEqual(["tag1", "tag2", "tag3"]);
  });

  it("strips # prefix from tags", () => {
    const result = parseObsidianFrontmatter({
      tags: ["#prefixed", "normal"],
    });
    expect(result.tags).toEqual(["prefixed", "normal"]);
  });

  it("strips # prefix from string tags", () => {
    const result = parseObsidianFrontmatter({
      tags: "#tag1, #tag2",
    });
    expect(result.tags).toEqual(["tag1", "tag2"]);
  });

  it("parses aliases as array", () => {
    const result = parseObsidianFrontmatter({
      aliases: ["alias1", "alias2"],
    });
    expect(result.aliases).toEqual(["alias1", "alias2"]);
  });

  it("parses aliases as string", () => {
    const result = parseObsidianFrontmatter({
      aliases: "single-alias",
    });
    expect(result.aliases).toEqual(["single-alias"]);
  });

  it("extracts custom fields", () => {
    const result = parseObsidianFrontmatter({
      tags: ["test"],
      title: "My Title",
      aliases: ["alt"],
      category: "notes",
      priority: 1,
    });
    expect(result.custom).toEqual({
      category: "notes",
      priority: 1,
    });
  });

  it("handles empty/missing fields", () => {
    const result = parseObsidianFrontmatter({});
    expect(result.tags).toEqual([]);
    expect(result.aliases).toEqual([]);
    expect(result.custom).toEqual({});
  });

  it("filters out non-string tags", () => {
    const result = parseObsidianFrontmatter({
      tags: ["valid", 123, null, "also-valid"],
    });
    expect(result.tags).toEqual(["valid", "also-valid"]);
  });
});

describe("extractInlineTags", () => {
  it("extracts inline tags", () => {
    const tags = extractInlineTags("Content with #tag1 and #tag2.");
    expect(tags).toContain("tag1");
    expect(tags).toContain("tag2");
  });

  it("extracts hierarchical tags", () => {
    const tags = extractInlineTags("A #parent/child tag.");
    expect(tags).toContain("parent/child");
  });

  it("deduplicates tags", () => {
    const tags = extractInlineTags("#same and #same again.");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toBe("same");
  });

  it("excludes tags in code blocks", () => {
    const content = ["Real #visible-tag here.", "```", "#hidden-tag", "```"].join("\n");
    const tags = extractInlineTags(content);
    expect(tags).toContain("visible-tag");
    expect(tags).not.toContain("hidden-tag");
  });

  it("excludes tags in inline code", () => {
    const content = "Real #real-tag and `#code-tag` here.";
    const tags = extractInlineTags(content);
    expect(tags).toContain("real-tag");
    expect(tags).not.toContain("code-tag");
  });

  it("handles tags with dashes and underscores", () => {
    const tags = extractInlineTags("Tags: #my-tag #my_tag #tag123");
    expect(tags).toContain("my-tag");
    expect(tags).toContain("my_tag");
    expect(tags).toContain("tag123");
  });

  it("returns empty for content without tags", () => {
    const tags = extractInlineTags("No tags here.");
    expect(tags).toHaveLength(0);
  });
});
