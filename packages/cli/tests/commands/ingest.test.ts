import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { ingestCommand } from "../../src/commands/ingest.js";

describe("ingest command", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-test-"));
    // Initialize git repo for git-history plugin
    execFileSync("git", ["init"], { cwd: testDir });
    // Create .knowledgine and DB
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should error when neither --source nor --all is specified", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ingestCommand({ path: testDir });
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("Error: Specify --source <pluginId> or --all");
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("should error when --source and --all are both specified", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ingestCommand({ source: "git-history", all: true, path: testDir });
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith("Error: --source and --all cannot be used together");
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("should error for non-existent plugin", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ingestCommand({ source: "nonexistent", path: testDir });
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plugin "nonexistent" is not registered'),
    );
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("should run --source with a specific plugin", async () => {
    // Create a markdown file for markdown plugin
    writeFileSync(join(testDir, "test.md"), "# Test\n\nContent");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ingestCommand({ source: "markdown", path: testDir });
    expect(process.exitCode).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("knowledgine ingest"));
    errorSpy.mockRestore();
  });

  it("should run --all to ingest all plugins", async () => {
    writeFileSync(join(testDir, "test.md"), "# Test\n\nContent");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ingestCommand({ all: true, path: testDir });
    expect(process.exitCode).toBeUndefined();
    errorSpy.mockRestore();
  });

  it("should pass --full flag to engine", async () => {
    writeFileSync(join(testDir, "test.md"), "# Test\n\nContent");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // First run to set cursor
    await ingestCommand({ source: "markdown", path: testDir });
    // Second run with --full to force re-ingest
    await ingestCommand({ source: "markdown", path: testDir, full: true });
    expect(process.exitCode).toBeUndefined();
    errorSpy.mockRestore();
  });

  it("should run git-history plugin with --source", async () => {
    // Create a commit
    writeFileSync(join(testDir, "file.txt"), "hello");
    execFileSync("git", ["add", "."], { cwd: testDir });
    execFileSync(
      "git",
      ["-c", "user.email=test@test.com", "-c", "user.name=Test", "commit", "-m", "init"],
      { cwd: testDir },
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ingestCommand({ source: "git-history", path: testDir });
    expect(process.exitCode).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("knowledgine ingest"));
    errorSpy.mockRestore();
  });
});
