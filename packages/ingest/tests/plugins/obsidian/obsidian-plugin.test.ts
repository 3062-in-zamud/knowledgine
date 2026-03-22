import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, cp, rm, utimes, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ObsidianPlugin } from "../../../src/plugins/obsidian/index.js";

const FIXTURE_PATH = join(
  __dirname,
  "../../fixtures/obsidian-vault",
);

describe("ObsidianPlugin", () => {
  let plugin: ObsidianPlugin;
  let tmpDir: string;

  beforeEach(async () => {
    plugin = new ObsidianPlugin();
    tmpDir = await mkdtemp(join(tmpdir(), "obsidian-test-"));
    await cp(FIXTURE_PATH, tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await plugin.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("manifest", () => {
    it("has correct plugin id and scheme", () => {
      expect(plugin.manifest.id).toBe("obsidian");
      expect(plugin.manifest.schemes).toContain("obsidian://");
    });
  });

  describe("initialize", () => {
    it("succeeds without config", async () => {
      const result = await plugin.initialize();
      expect(result.ok).toBe(true);
    });

    it("succeeds with valid vault path", async () => {
      const result = await plugin.initialize({ sourcePath: tmpDir });
      expect(result.ok).toBe(true);
    });

    it("fails when .obsidian directory is missing", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "no-vault-"));
      try {
        const result = await plugin.initialize({ sourcePath: emptyDir });
        expect(result.ok).toBe(false);
        expect(result.error).toContain(".obsidian");
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe("ingestAll", () => {
    it("yields events for all markdown files", async () => {
      const events: unknown[] = [];
      for await (const event of plugin.ingestAll(tmpDir)) {
        events.push(event);
      }
      // simple-note.md, note-with-links.md, note-with-tags.md, daily/2025-01-01.md
      expect(events.length).toBe(4);
    });

    it("generates correct sourceUri as relative path", async () => {
      const events: { sourceUri: string }[] = [];
      for await (const event of plugin.ingestAll(tmpDir)) {
        events.push(event);
      }
      for (const event of events) {
        expect(event.sourceUri).not.toContain("://");
        expect(event.sourceUri).toMatch(/\.md$/);
      }
    });

    it("uses document as eventType", async () => {
      for await (const event of plugin.ingestAll(tmpDir)) {
        expect(event.eventType).toBe("document");
      }
    });

    it("extracts frontmatter tags", async () => {
      const events: { title: string; metadata: { tags?: string[] } }[] = [];
      for await (const event of plugin.ingestAll(tmpDir)) {
        events.push(event);
      }
      const simpleNote = events.find((e) => e.title === "Simple Note");
      expect(simpleNote).toBeDefined();
      expect(simpleNote!.metadata.tags).toContain("test");
      expect(simpleNote!.metadata.tags).toContain("example");
    });

    it("merges frontmatter and inline tags", async () => {
      const events: { title: string; metadata: { tags?: string[] } }[] = [];
      for await (const event of plugin.ingestAll(tmpDir)) {
        events.push(event);
      }
      const taggedNote = events.find((e) => e.title === "Tagged Note");
      expect(taggedNote).toBeDefined();
      // frontmatter tags (# stripped)
      expect(taggedNote!.metadata.tags).toContain("frontmatter-tag");
      expect(taggedNote!.metadata.tags).toContain("another-tag");
      // inline tags
      expect(taggedNote!.metadata.tags).toContain("inline-tag");
      expect(taggedNote!.metadata.tags).toContain("nested/tag");
      expect(taggedNote!.metadata.tags).toContain("final-tag");
    });

    it("resolves wikilinks to relatedPaths", async () => {
      const events: {
        title: string;
        relatedPaths?: string[];
        metadata: { extra?: Record<string, unknown> };
      }[] = [];
      for await (const event of plugin.ingestAll(tmpDir)) {
        events.push(event);
      }
      const linkedNote = events.find((e) => e.title === "Note with Links");
      expect(linkedNote).toBeDefined();
      // simple-note.md should be resolved
      expect(linkedNote!.relatedPaths).toContain("simple-note.md");
    });

    it("includes aliases in extra metadata", async () => {
      const events: {
        title: string;
        metadata: { extra?: Record<string, unknown> };
      }[] = [];
      for await (const event of plugin.ingestAll(tmpDir)) {
        events.push(event);
      }
      const linkedNote = events.find((e) => e.title === "Note with Links");
      expect(linkedNote).toBeDefined();
      expect(linkedNote!.metadata.extra?.aliases).toEqual(["linked-note"]);
    });

    it("skips .obsidian directory files", async () => {
      const events: { sourceUri: string }[] = [];
      for await (const event of plugin.ingestAll(tmpDir)) {
        events.push(event);
      }
      for (const event of events) {
        expect(event.sourceUri).not.toContain(".obsidian");
      }
    });

    it("yields nothing for non-vault directory", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "no-vault-"));
      try {
        const events: unknown[] = [];
        for await (const event of plugin.ingestAll(emptyDir)) {
          events.push(event);
        }
        expect(events).toHaveLength(0);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe("ingestIncremental", () => {
    it("only yields files modified after checkpoint", async () => {
      // Set all files to old mtime
      const oldDate = new Date("2020-01-01T00:00:00Z");
      const simpleNotePath = join(tmpDir, "simple-note.md");
      const noteWithLinksPath = join(tmpDir, "note-with-links.md");
      const noteWithTagsPath = join(tmpDir, "note-with-tags.md");
      const dailyNotePath = join(tmpDir, "daily", "2025-01-01.md");

      await utimes(simpleNotePath, oldDate, oldDate);
      await utimes(noteWithLinksPath, oldDate, oldDate);
      await utimes(noteWithTagsPath, oldDate, oldDate);
      await utimes(dailyNotePath, oldDate, oldDate);

      // Touch one file to make it "new"
      const newDate = new Date("2025-06-01T00:00:00Z");
      await utimes(simpleNotePath, newDate, newDate);

      const checkpoint = "2025-01-01T00:00:00Z";
      const events: { title: string }[] = [];
      for await (const event of plugin.ingestIncremental(tmpDir, checkpoint)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Simple Note");
    });
  });

  describe("getCurrentCheckpoint", () => {
    it("returns ISO date string", async () => {
      const checkpoint = await plugin.getCurrentCheckpoint(tmpDir);
      expect(() => new Date(checkpoint)).not.toThrow();
      expect(new Date(checkpoint).toISOString()).toBe(checkpoint);
    });
  });
});
