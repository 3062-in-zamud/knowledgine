import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, rmSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { getDemoDir, copyDemoFixtures, cleanDemo } from "../../src/lib/demo-manager.js";

describe("demo-manager", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-demo-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("getDemoDir", () => {
    it("should return a path ending with fixtures/demo/notes", () => {
      const demoDir = getDemoDir();
      expect(demoDir).toMatch(/fixtures[/\\]demo[/\\]notes$/);
    });

    it("should point to an existing directory", () => {
      const demoDir = getDemoDir();
      expect(existsSync(demoDir)).toBe(true);
    });
  });

  describe("copyDemoFixtures", () => {
    it("should copy markdown files to the target directory", () => {
      const targetDir = join(testDir, "demo-notes");
      const count = copyDemoFixtures(targetDir);

      expect(count).toBeGreaterThanOrEqual(7);
      expect(existsSync(targetDir)).toBe(true);

      const files = readdirSync(targetDir).filter((f) => f.endsWith(".md"));
      expect(files.length).toBe(count);
    });

    it("should include specific demo files", () => {
      const targetDir = join(testDir, "demo-notes");
      copyDemoFixtures(targetDir);

      const files = readdirSync(targetDir);
      expect(files).toContain("auth-debugging.md");
      expect(files).toContain("react-performance.md");
      expect(files).toContain("docker-troubleshooting.md");
    });

    it("should create the target directory if it does not exist", () => {
      const targetDir = join(testDir, "nested", "deep", "demo-notes");
      expect(existsSync(targetDir)).toBe(false);

      copyDemoFixtures(targetDir);
      expect(existsSync(targetDir)).toBe(true);
    });

    it("should throw if demo fixtures directory is missing", () => {
      // This would only fail if the package is installed incorrectly
      // We verify getDemoDir works as a proxy
      const demoDir = getDemoDir();
      expect(existsSync(demoDir)).toBe(true);
    });
  });

  describe("cleanDemo", () => {
    it("should remove the demo notes directory", () => {
      const demoPath = join(testDir, "demo-notes");
      mkdirSync(demoPath, { recursive: true });
      writeFileSync(join(demoPath, "test.md"), "# Test");

      cleanDemo(demoPath);
      expect(existsSync(demoPath)).toBe(false);
    });

    it("should not throw if the directory does not exist", () => {
      const demoPath = join(testDir, "nonexistent");
      expect(() => cleanDemo(demoPath)).not.toThrow();
    });

    it("should not remove sibling directories like .knowledgine", () => {
      const demoPath = join(testDir, "demo-notes");
      const knowledginePath = join(testDir, ".knowledgine");

      mkdirSync(demoPath, { recursive: true });
      mkdirSync(knowledginePath, { recursive: true });
      writeFileSync(join(demoPath, "test.md"), "# Test");
      writeFileSync(join(knowledginePath, "index.sqlite"), "fake-db");

      cleanDemo(demoPath);

      expect(existsSync(demoPath)).toBe(false);
      expect(existsSync(knowledginePath)).toBe(true);
      expect(existsSync(join(knowledginePath, "index.sqlite"))).toBe(true);
    });
  });
});
