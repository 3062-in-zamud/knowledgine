import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { pluginsListCommand, pluginsStatusCommand } from "../../src/commands/plugins.js";

describe("plugins commands", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("plugins list", () => {
    it("should display all registered plugins", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await pluginsListCommand();

      const output = errorSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("markdown");
      expect(output).toContain("git-history");
      expect(output).toContain("claude-sessions");
      expect(output).toContain("Markdown Files");
      expect(output).toContain("Git History");
      expect(output).toContain("Claude Code Sessions");
      errorSpy.mockRestore();
    });

    it("should display version and priority", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await pluginsListCommand();

      const output = errorSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("0.1.0");
      errorSpy.mockRestore();
    });
  });

  describe("plugins status", () => {
    it("should show 'never' for plugins that haven't run", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await pluginsStatusCommand({ path: testDir });

      const output = errorSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("markdown");
      expect(output).toContain("never");
      expect(output).toContain("-");
      errorSpy.mockRestore();
    });

    it("should display header row", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await pluginsStatusCommand({ path: testDir });

      const output = errorSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Plugin");
      expect(output).toContain("Last Ingest");
      expect(output).toContain("Checkpoint");
      errorSpy.mockRestore();
    });
  });
});
