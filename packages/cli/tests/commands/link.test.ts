import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join, resolve as resolvePath, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { linkCommand, showLinkCommand } from "../../src/commands/link.js";

const LINK_SOURCE_PATH = resolvePath(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/commands/link.ts",
);

function makeProject(opts: { seedTitle?: string; seedFilePath?: string }): {
  dir: string;
  noteId?: number;
} {
  const dir = mkdtempSync(join(tmpdir(), "knowledgine-cli-link-"));
  const dbPath = join(dir, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  let noteId: number | undefined;
  if (opts.seedTitle) {
    noteId = new KnowledgeRepository(db).saveNote({
      filePath: opts.seedFilePath ?? "x.md",
      title: opts.seedTitle,
      content: `body of ${opts.seedTitle}`,
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
  }
  db.close();
  return { dir, noteId };
}

describe("link / show-link CLI commands", () => {
  const cleanup: string[] = [];
  let stderrOutput: string[];
  let stdoutOutput: string[];
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | undefined;
  const originalCwd = process.cwd();

  beforeEach(() => {
    stderrOutput = [];
    stdoutOutput = [];
    stderrSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderrOutput.push(args.map(String).join(" "));
    });
    stdoutSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      stdoutOutput.push(args.map(String).join(" "));
    });
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    process.exitCode = originalExitCode;
    process.chdir(originalCwd);
    for (const d of cleanup.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("link --format json emits success envelope", async () => {
    const src = makeProject({ seedTitle: "S", seedFilePath: "s.md" });
    const tgt = makeProject({});
    cleanup.push(src.dir, tgt.dir);

    await linkCommand({
      source: src.dir,
      noteId: String(src.noteId!),
      into: tgt.dir,
      format: "json",
    });
    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdoutOutput[0]);
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("link");
    expect(parsed.result.targetNoteId).toBeGreaterThan(0);
    expect(parsed.result.linkRowId).toBeGreaterThan(0);
  });

  it("rejects non-positive --note-id (link)", async () => {
    const src = makeProject({});
    const tgt = makeProject({});
    cleanup.push(src.dir, tgt.dir);

    await linkCommand({
      source: src.dir,
      noteId: "abc",
      into: tgt.dir,
      format: "json",
    });
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(stdoutOutput[0]);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/--note-id must be a positive integer/);
  });

  it("show-link returns ok with the source body for a valid stub", async () => {
    const src = makeProject({ seedTitle: "Resolved", seedFilePath: "r.md" });
    const tgt = makeProject({});
    cleanup.push(src.dir, tgt.dir);

    // Create the link first
    await linkCommand({
      source: src.dir,
      noteId: String(src.noteId!),
      into: tgt.dir,
      format: "json",
    });
    expect(process.exitCode).toBe(0);
    const linkResult = JSON.parse(stdoutOutput[0]);
    const stubId = linkResult.result.targetNoteId;
    stdoutOutput.length = 0;

    await showLinkCommand({
      stubId: String(stubId),
      format: "json",
      path: tgt.dir,
    });
    expect(process.exitCode).toBe(0);
    const resolved = JSON.parse(stdoutOutput[0]);
    expect(resolved.ok).toBe(true);
    expect(resolved.command).toBe("show-link");
    expect(resolved.result.status).toBe("ok");
    expect(resolved.result.sourceNote.title).toBe("Resolved");
    expect(resolved.result.sourceNote.content).toBe("body of Resolved");
  });

  it("show-link reports source_missing when the source project is gone", async () => {
    const src = makeProject({ seedTitle: "Gone", seedFilePath: "g.md" });
    const tgt = makeProject({});
    cleanup.push(tgt.dir);
    // intentionally do NOT add src to cleanup; we delete it manually below

    await linkCommand({
      source: src.dir,
      noteId: String(src.noteId!),
      into: tgt.dir,
      format: "json",
    });
    expect(process.exitCode).toBe(0);
    const linkResult = JSON.parse(stdoutOutput[0]);
    const stubId = linkResult.result.targetNoteId;
    stdoutOutput.length = 0;

    rmSync(src.dir, { recursive: true, force: true });

    await showLinkCommand({
      stubId: String(stubId),
      format: "json",
      path: tgt.dir,
    });
    expect(process.exitCode).toBe(0);
    const resolved = JSON.parse(stdoutOutput[0]);
    expect(resolved.result.status).toBe("source_missing");
  });

  it("show-link plain output renders [broken link: ...] when source is gone", async () => {
    const src = makeProject({ seedTitle: "GonePlain", seedFilePath: "gp.md" });
    const tgt = makeProject({});
    cleanup.push(tgt.dir);

    await linkCommand({
      source: src.dir,
      noteId: String(src.noteId!),
      into: tgt.dir,
      format: "json",
    });
    const linkResult = JSON.parse(stdoutOutput[0]);
    const stubId = linkResult.result.targetNoteId;
    stdoutOutput.length = 0;
    stderrOutput.length = 0;
    rmSync(src.dir, { recursive: true, force: true });

    await showLinkCommand({
      stubId: String(stubId),
      format: "plain",
      path: tgt.dir,
    });
    const text = stderrOutput.join("\n");
    expect(text).toMatch(/\[broken link: /);
  });

  it("link.ts source contains no internal ticket id token (KNOW-)", () => {
    const src = readFileSync(LINK_SOURCE_PATH, "utf-8");
    expect(src).not.toMatch(/KNOW-\d+/);
  });
});
