import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseWikiLinks,
  resolveWikiLinkPath,
} from "../../../src/plugins/obsidian/wikilink-parser.js";

describe("parseWikiLinks", () => {
  it("parses basic [[note]] link", () => {
    const links = parseWikiLinks("See [[my-note]] for details.");
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({
      raw: "[[my-note]]",
      target: "my-note",
      alias: undefined,
      heading: undefined,
      isEmbed: false,
    });
  });

  it("parses [[note|alias]] link", () => {
    const links = parseWikiLinks("See [[my-note|My Note]] here.");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      target: "my-note",
      alias: "My Note",
      isEmbed: false,
    });
  });

  it("parses [[note#heading]] link", () => {
    const links = parseWikiLinks("See [[my-note#section]] here.");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      target: "my-note",
      heading: "section",
      alias: undefined,
      isEmbed: false,
    });
  });

  it("parses [[note#heading|alias]] link", () => {
    const links = parseWikiLinks("See [[my-note#section|Section Link]] here.");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      target: "my-note",
      heading: "section",
      alias: "Section Link",
      isEmbed: false,
    });
  });

  it("parses ![[embed]] link", () => {
    const links = parseWikiLinks("Content: ![[embedded-note]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      target: "embedded-note",
      isEmbed: true,
    });
  });

  it("parses ![[image.png]] embed", () => {
    const links = parseWikiLinks("Image: ![[photo.png]]");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      target: "photo.png",
      isEmbed: true,
    });
  });

  it("excludes empty links [[]]", () => {
    const links = parseWikiLinks("Empty: [[]]");
    expect(links).toHaveLength(0);
  });

  it("excludes path traversal [[../../etc/passwd]]", () => {
    const links = parseWikiLinks("Bad: [[../../etc/passwd]]");
    expect(links).toHaveLength(0);
  });

  it("excludes links inside code blocks", () => {
    const content = [
      "Before link.",
      "```",
      "[[inside-code-block]]",
      "```",
      "After link: [[real-link]]",
    ].join("\n");
    const links = parseWikiLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("real-link");
  });

  it("excludes links inside inline code", () => {
    const content = "Inline `[[not-a-link]]` and [[real-link]]";
    const links = parseWikiLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("real-link");
  });

  it("ignores broken syntax [[unclosed", () => {
    const links = parseWikiLinks("Broken: [[unclosed");
    expect(links).toHaveLength(0);
  });

  it("parses multiple links in one document", () => {
    const content =
      "See [[note-a]] and [[note-b|B]] plus ![[embed]] here.";
    const links = parseWikiLinks(content);
    expect(links).toHaveLength(3);
  });
});

describe("resolveWikiLinkPath", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "wikilink-test-"));
    await writeFile(join(tmpDir, "existing.md"), "# Existing");
    await mkdir(join(tmpDir, "subdir"), { recursive: true });
    await writeFile(join(tmpDir, "subdir", "nested.md"), "# Nested");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves existing .md file", () => {
    const result = resolveWikiLinkPath(
      "existing.md",
      tmpDir,
      join(tmpDir, "current.md"),
    );
    expect(result).toBe(join(tmpDir, "existing.md"));
  });

  it("auto-appends .md extension", () => {
    const result = resolveWikiLinkPath(
      "existing",
      tmpDir,
      join(tmpDir, "current.md"),
    );
    expect(result).toBe(join(tmpDir, "existing.md"));
  });

  it("resolves nested file", () => {
    const result = resolveWikiLinkPath(
      "subdir/nested",
      tmpDir,
      join(tmpDir, "current.md"),
    );
    expect(result).toBe(join(tmpDir, "subdir", "nested.md"));
  });

  it("returns null for non-existent file", () => {
    const result = resolveWikiLinkPath(
      "nonexistent",
      tmpDir,
      join(tmpDir, "current.md"),
    );
    expect(result).toBeNull();
  });

  it("rejects path traversal", () => {
    const result = resolveWikiLinkPath(
      "../outside",
      tmpDir,
      join(tmpDir, "current.md"),
    );
    expect(result).toBeNull();
  });

  it("rejects paths outside vault", () => {
    const result = resolveWikiLinkPath(
      "/etc/passwd",
      tmpDir,
      join(tmpDir, "current.md"),
    );
    expect(result).toBeNull();
  });
});
