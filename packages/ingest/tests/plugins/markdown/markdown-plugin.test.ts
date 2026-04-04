import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { MarkdownPlugin } from "../../../src/plugins/markdown/index.js";

describe("MarkdownPlugin", () => {
  let plugin: MarkdownPlugin;
  let testDir: string;

  beforeEach(async () => {
    plugin = new MarkdownPlugin();
    testDir = await mkdtemp(join(tmpdir(), "knowledgine-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should have correct manifest", () => {
    expect(plugin.manifest.id).toBe("markdown");
    expect(plugin.manifest.name).toBe("Markdown Files");
    expect(plugin.manifest.version).toBe("0.1.0");
    expect(plugin.manifest.schemes).toEqual(["file://"]);
    expect(plugin.manifest.priority).toBe(0);
  });

  it("should have correct triggers", () => {
    expect(plugin.triggers).toHaveLength(1);
    expect(plugin.triggers[0].type).toBe("file_watcher");
  });

  it("should initialize successfully", async () => {
    const result = await plugin.initialize();
    expect(result.ok).toBe(true);
  });

  it("should initialize successfully with config", async () => {
    const result = await plugin.initialize({ someOption: "value" });
    expect(result.ok).toBe(true);
  });

  describe("ingestAll", () => {
    it("should yield events for all markdown files", async () => {
      await writeFile(join(testDir, "a.md"), "# Title A\nContent A");
      await writeFile(join(testDir, "b.md"), "# Title B\nContent B");
      await writeFile(join(testDir, "c.md"), "# Title C\nContent C");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      const titles = events.map((e) => e.title).sort();
      expect(titles).toEqual(["Title A", "Title B", "Title C"]);

      for (const event of events) {
        expect(event.eventType).toBe("document");
        expect(event.sourceUri).not.toContain("://");
        expect(event.metadata.sourcePlugin).toBe("markdown");
        expect(event.timestamp).toBeInstanceOf(Date);
      }
    });

    it("should handle nested directories", async () => {
      const subDir = join(testDir, "subdir");
      await mkdir(subDir, { recursive: true });
      await writeFile(join(testDir, "root.md"), "# Root");
      await writeFile(join(subDir, "nested.md"), "# Nested");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      const titles = events.map((e) => e.title).sort();
      expect(titles).toEqual(["Nested", "Root"]);
    });

    it("should skip non-markdown files", async () => {
      await writeFile(join(testDir, "doc.md"), "# Markdown");
      await writeFile(join(testDir, "script.js"), "console.log('hello')");
      await writeFile(join(testDir, "data.txt"), "plain text");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Markdown");
    });

    it("should extract frontmatter tags", async () => {
      const content = `---
tags:
  - typescript
  - plugin
---
# Tagged Document
Body content here.
`;
      await writeFile(join(testDir, "tagged.md"), content);

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].metadata.tags).toEqual(["typescript", "plugin"]);
    });

    it("should extract title from heading", async () => {
      await writeFile(join(testDir, "with-heading.md"), "# My Heading Title\nsome content");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events[0].title).toBe("My Heading Title");
    });

    it("should use filename when no heading", async () => {
      await writeFile(join(testDir, "my-note.md"), "just some content without heading");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events[0].title).toBe("my-note");
    });

    it("should set sourceUri as relative path", async () => {
      await writeFile(join(testDir, "note.md"), "# Note");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events[0].sourceUri).toBe("note.md");
    });

    it("should set relatedPaths as relative path", async () => {
      await writeFile(join(testDir, "note.md"), "# Note");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events[0].relatedPaths).toEqual(["note.md"]);
    });

    it("should skip hidden directories", async () => {
      const hiddenDir = join(testDir, ".hidden");
      await mkdir(hiddenDir, { recursive: true });
      await writeFile(join(hiddenDir, "secret.md"), "# Secret");
      await writeFile(join(testDir, "visible.md"), "# Visible");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Visible");
    });

    it("should skip node_modules directory", async () => {
      const nodeModules = join(testDir, "node_modules");
      await mkdir(nodeModules, { recursive: true });
      await writeFile(join(nodeModules, "dep.md"), "# Dep");
      await writeFile(join(testDir, "main.md"), "# Main");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Main");
    });

    it("should return empty array for empty directory", async () => {
      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });
  });

  describe("skip reasons", () => {
    it("should not set skippedReason for normal readable files", async () => {
      await writeFile(join(testDir, "normal.md"), "# Normal File\nsome content");

      const events: import("../../../src/types.js").NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0].content).not.toBe("");
      expect(events[0].metadata.skippedReason).toBeUndefined();
    });

    it("should yield event with skippedReason=too_large for files exceeding 10 MB", async () => {
      // Create a file larger than 10 MB
      const largeContent = "x".repeat(11 * 1024 * 1024);
      await writeFile(join(testDir, "large.md"), largeContent);

      const events: import("../../../src/types.js").NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0].content).toBe("");
      expect(events[0].metadata.skippedReason).toBe("too_large");
    });

    it("should yield event with skippedReason=read_error when file cannot be processed", async () => {
      // Use an empty path that passes walkDir but fails processFile by using
      // a directory path as if it were a file (FileProcessor will throw on it)
      // The simplest way: write a file that becomes unreadable between walk and process
      // by writing to a sub-directory named with .md suffix (which is found by walkDir
      // as a file entry).
      // Actually: write a valid .md, then chmod 000 to make it unreadable.
      const { chmod } = await import("fs/promises");
      const filePath = join(testDir, "unreadable.md");
      await writeFile(filePath, "# Unreadable");
      await chmod(filePath, 0o000);

      try {
        const events: import("../../../src/types.js").NormalizedEvent[] = [];
        for await (const event of plugin.ingestAll(testDir)) {
          events.push(event);
        }
        // If running as root, permission errors won't occur — skip assertion
        if (process.getuid && process.getuid() !== 0) {
          expect(events).toHaveLength(1);
          expect(events[0].content).toBe("");
          expect(events[0].metadata.skippedReason).toBe("read_error");
        }
      } finally {
        // Restore permissions so cleanup can succeed
        await chmod(filePath, 0o644);
      }
    });
  });

  describe("ingestIncremental", () => {
    it("should only yield files modified after checkpoint", async () => {
      // 過去の時刻をチェックポイントとして設定
      const checkpoint = new Date(Date.now() - 5000).toISOString();

      await writeFile(join(testDir, "new-file.md"), "# New File");

      const events = [];
      for await (const event of plugin.ingestIncremental(testDir, checkpoint)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("New File");
    });

    it("should not yield files modified before checkpoint", async () => {
      await writeFile(join(testDir, "old-file.md"), "# Old File");

      // ファイル作成後にチェックポイントを設定
      const checkpoint = new Date(Date.now() + 5000).toISOString();

      const events = [];
      for await (const event of plugin.ingestIncremental(testDir, checkpoint)) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });
  });

  it("should return ISO date string as checkpoint", async () => {
    const before = new Date();
    const checkpoint = await plugin.getCurrentCheckpoint(testDir);
    const after = new Date();

    const checkpointDate = new Date(checkpoint);
    expect(checkpointDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(checkpointDate.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(checkpoint).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("should dispose without error", async () => {
    await expect(plugin.dispose()).resolves.toBeUndefined();
  });
});
