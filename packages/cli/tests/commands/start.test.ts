import { describe, it, expect } from "vitest";
import { startCommand } from "../../src/commands/start.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("start command", () => {
  it("should export startCommand function", () => {
    expect(typeof startCommand).toBe("function");
  });

  describe("file watcher ignored patterns", () => {
    it("should include .git and dist in the source code ignored array", () => {
      // Verify the source file contains the expected ignored patterns
      // This is a structural test since invoking startCommand requires MCP stdio setup
      const sourceCode = readFileSync(
        resolve(import.meta.dirname, "../../src/commands/start.ts"),
        "utf-8",
      );
      expect(sourceCode).toContain("/\\.git/");
      expect(sourceCode).toContain("/dist/");
      expect(sourceCode).toContain("/node_modules/");
      expect(sourceCode).toContain("/\\.knowledgine/");
    });
  });
});
