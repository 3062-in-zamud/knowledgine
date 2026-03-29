import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchCommand } from "../../src/commands/search.js";

describe("searchCommand input validation", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    stderrSpy.mockRestore();
  });

  describe("query validation", () => {
    it("should reject empty string query", async () => {
      await searchCommand("", {});

      expect(process.exitCode).toBe(1);
      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("Search query cannot be empty");
    });

    it("should reject whitespace-only query", async () => {
      await searchCommand("   ", {});

      expect(process.exitCode).toBe(1);
      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("Search query cannot be empty");
    });

    it("should reject tab-only query", async () => {
      await searchCommand("\t\n", {});

      expect(process.exitCode).toBe(1);
      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("Search query cannot be empty");
    });

    it("should include usage hint for empty query", async () => {
      await searchCommand("", {});

      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("Usage:");
      expect(output).toContain("knowledgine search");
    });
  });

  describe("mode validation", () => {
    it("should reject invalid mode value", async () => {
      await searchCommand("hello", { mode: "fuzzy" });

      expect(process.exitCode).toBe(1);
      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain('Invalid search mode "fuzzy"');
    });

    it("should list valid modes on invalid mode error", async () => {
      await searchCommand("hello", { mode: "invalid" });

      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("keyword");
      expect(output).toContain("semantic");
      expect(output).toContain("hybrid");
    });

    it("should accept keyword mode without validation error", async () => {
      // keyword is valid — validation passes, subsequent error is about missing init
      await searchCommand("hello", { mode: "keyword" });

      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).not.toContain("Invalid search mode");
    });

    it("should accept semantic mode without validation error", async () => {
      await searchCommand("hello", { mode: "semantic" });

      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).not.toContain("Invalid search mode");
    });

    it("should accept hybrid mode without validation error", async () => {
      await searchCommand("hello", { mode: "hybrid" });

      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).not.toContain("Invalid search mode");
    });

    it("should not validate mode when mode is not provided", async () => {
      // No mode specified — validation passes
      await searchCommand("hello", {});

      const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).not.toContain("Invalid search mode");
    });
  });
});
