import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { createDatabase, Migrator, ALL_MIGRATIONS, KnowledgeRepository } from "@knowledgine/core";
import { registerFeedbackSuggestCommand } from "../../src/commands/feedback-suggest.js";
import { Command } from "commander";

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit in tests
  registerFeedbackSuggestCommand(program);
  return program;
}

describe("feedback-suggest command", () => {
  let testDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let dbPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-feedback-suggest-test-${randomUUID()}`);
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });

    dbPath = join(testDir, ".knowledgine", "index.sqlite");

    // Create minimal sqlite db with a note
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repo = new KnowledgeRepository(db);
    repo.saveNote({
      filePath: "test.md",
      title: "Test Note",
      content: "Content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    db.close();

    writeFileSync(join(testDir, ".knowledgine", "config.json"), JSON.stringify({ dbPath }));

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should save useful feedback when --useful flag is provided", async () => {
    const program = makeProgram();
    await program.parseAsync([
      "node",
      "cli",
      "feedback-suggest",
      "1",
      "--useful",
      "--path",
      testDir,
    ]);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Feedback saved"));

    // Verify in DB
    const db = createDatabase(dbPath);
    const repo = new KnowledgeRepository(db);
    const records = repo.getSuggestFeedbackForNote(1);
    db.close();
    expect(records).toHaveLength(1);
    expect(records[0].isUseful).toBe(true);
  });

  it("should save not-useful feedback when --not-useful flag is provided", async () => {
    const program = makeProgram();
    await program.parseAsync([
      "node",
      "cli",
      "feedback-suggest",
      "1",
      "--not-useful",
      "--path",
      testDir,
    ]);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Feedback saved"));

    // Verify in DB
    const db = createDatabase(dbPath);
    const repo = new KnowledgeRepository(db);
    const records = repo.getSuggestFeedbackForNote(1);
    db.close();
    expect(records).toHaveLength(1);
    expect(records[0].isUseful).toBe(false);
  });

  it("should show error when noteId is not a number", async () => {
    const program = makeProgram();
    await program.parseAsync([
      "node",
      "cli",
      "feedback-suggest",
      "abc",
      "--useful",
      "--path",
      testDir,
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid note ID"));
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("should show error when neither --useful nor --not-useful is provided", async () => {
    const program = makeProgram();
    await program.parseAsync(["node", "cli", "feedback-suggest", "1", "--path", testDir]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("--useful"));
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("should show error when noteId does not exist", async () => {
    const program = makeProgram();
    await program.parseAsync([
      "node",
      "cli",
      "feedback-suggest",
      "9999",
      "--useful",
      "--path",
      testDir,
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Note not found"));
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
