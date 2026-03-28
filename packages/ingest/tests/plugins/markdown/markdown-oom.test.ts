import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { MarkdownPlugin } from "../../../src/plugins/markdown/index.js";

describe("MarkdownPlugin OOM対策", () => {
  let plugin: MarkdownPlugin;
  let testDir: string;

  beforeEach(async () => {
    plugin = new MarkdownPlugin();
    testDir = await mkdtemp(join(tmpdir(), "knowledgine-oom-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("ignore patterns", () => {
    it("should skip vendor/ directory", async () => {
      const vendorDir = join(testDir, "vendor");
      await mkdir(vendorDir, { recursive: true });
      await writeFile(join(vendorDir, "lib.md"), "# Vendor Lib");
      await writeFile(join(testDir, "main.md"), "# Main");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Main");
    });

    it("should skip __pycache__/ directory", async () => {
      const pycacheDir = join(testDir, "__pycache__");
      await mkdir(pycacheDir, { recursive: true });
      await writeFile(join(pycacheDir, "cache.md"), "# Cache");
      await writeFile(join(testDir, "main.md"), "# Main");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Main");
    });

    it("should skip dist/ directory", async () => {
      const distDir = join(testDir, "dist");
      await mkdir(distDir, { recursive: true });
      await writeFile(join(distDir, "output.md"), "# Dist Output");
      await writeFile(join(testDir, "src.md"), "# Source");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Source");
    });

    it("should skip build/ directory", async () => {
      const buildDir = join(testDir, "build");
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, "compiled.md"), "# Compiled");
      await writeFile(join(testDir, "source.md"), "# Source");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Source");
    });
  });

  describe("file size limit", () => {
    it("should skip files larger than MAX_FILE_SIZE_BYTES", async () => {
      // Create a file larger than 10MB
      const largeContent = "x".repeat(11 * 1024 * 1024);
      await writeFile(join(testDir, "huge.md"), largeContent);
      await writeFile(join(testDir, "small.md"), "# Small File");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Small File");
    });

    it("should include files at or under MAX_FILE_SIZE_BYTES", async () => {
      await writeFile(join(testDir, "normal.md"), "# Normal File\nSome content");

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Normal File");
    });
  });

  describe("ingestIncremental with ignore patterns", () => {
    it("should skip vendor/ in incremental mode", async () => {
      const checkpoint = new Date(Date.now() - 5000).toISOString();
      const vendorDir = join(testDir, "vendor");
      await mkdir(vendorDir, { recursive: true });
      await writeFile(join(vendorDir, "lib.md"), "# Vendor Lib");
      await writeFile(join(testDir, "new.md"), "# New File");

      const events = [];
      for await (const event of plugin.ingestIncremental(testDir, checkpoint)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("New File");
    });

    it("should skip oversized files in incremental mode", async () => {
      const checkpoint = new Date(Date.now() - 5000).toISOString();
      const largeContent = "x".repeat(11 * 1024 * 1024);
      await writeFile(join(testDir, "huge.md"), largeContent);
      await writeFile(join(testDir, "small.md"), "# Small");

      const events = [];
      for await (const event of plugin.ingestIncremental(testDir, checkpoint)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Small");
    });
  });
});
