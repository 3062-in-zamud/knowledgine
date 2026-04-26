import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join, resolve as resolvePath, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { transferCommand } from "../../src/commands/transfer.js";

const TRANSFER_SOURCE_PATH = resolvePath(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/commands/transfer.ts",
);

interface ProjectFixture {
  dir: string;
  projectName: string;
}

function makeProject(opts: {
  name: string;
  seedNote?: { filePath: string; title: string };
}): ProjectFixture {
  const dir = mkdtempSync(join(tmpdir(), `knowledgine-cli-xfer-${opts.name}-`));
  const dbPath = join(dir, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  if (opts.seedNote) {
    new KnowledgeRepository(db).saveNote({
      filePath: opts.seedNote.filePath,
      title: opts.seedNote.title,
      content: `body of ${opts.seedNote.title}`,
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
  }
  db.close();
  return { dir, projectName: opts.name };
}

function writeRc(dir: string, content: Record<string, unknown>): void {
  writeFileSync(join(dir, ".knowledginerc.json"), JSON.stringify(content, null, 2));
}

describe("transfer command", () => {
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

  it("plain output: succeeds and reports copied tables", async () => {
    const src = makeProject({ name: "src", seedNote: { filePath: "n1.md", title: "First" } });
    const tgt = makeProject({ name: "tgt" });
    cleanup.push(src.dir, tgt.dir);

    // Read note id
    const dbPath = join(src.dir, ".knowledgine", "index.sqlite");
    const db = createDatabase(dbPath);
    const id = new KnowledgeRepository(db).getNoteByPath("n1.md")!.id;
    db.close();

    await transferCommand({
      from: src.dir,
      to: tgt.dir,
      noteId: String(id),
      format: "plain",
    });

    expect(process.exitCode).toBe(0);
    const text = stderrOutput.join("\n");
    expect(text).toMatch(/Transferred note #/);
    expect(text).toContain("Copied:");
    expect(text).toContain("knowledge_notes");
  });

  it("json output: prints a structured success envelope", async () => {
    const src = makeProject({ name: "src", seedNote: { filePath: "j.md", title: "J" } });
    const tgt = makeProject({ name: "tgt" });
    cleanup.push(src.dir, tgt.dir);
    const id = (() => {
      const db = createDatabase(join(src.dir, ".knowledgine", "index.sqlite"));
      const x = new KnowledgeRepository(db).getNoteByPath("j.md")!.id;
      db.close();
      return x;
    })();

    await transferCommand({
      from: src.dir,
      to: tgt.dir,
      noteId: String(id),
      format: "json",
    });
    expect(process.exitCode).toBe(0);
    expect(stdoutOutput.length).toBe(1);
    const parsed = JSON.parse(stdoutOutput[0]);
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("transfer");
    expect(parsed.dryRun).toBe(false);
    expect(parsed.result.targetNoteId).toBeGreaterThan(0);
  });

  it("--dry-run does not modify the target", async () => {
    const src = makeProject({ name: "src", seedNote: { filePath: "d.md", title: "D" } });
    const tgt = makeProject({ name: "tgt" });
    cleanup.push(src.dir, tgt.dir);
    const id = (() => {
      const db = createDatabase(join(src.dir, ".knowledgine", "index.sqlite"));
      const x = new KnowledgeRepository(db).getNoteByPath("d.md")!.id;
      db.close();
      return x;
    })();

    await transferCommand({
      from: src.dir,
      to: tgt.dir,
      noteId: String(id),
      dryRun: true,
      format: "json",
    });
    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdoutOutput[0]);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.result.targetNoteId).toBe(-1);
    // Target unchanged: nothing in tgt
    const db = createDatabase(join(tgt.dir, ".knowledgine", "index.sqlite"));
    const tgtRow = new KnowledgeRepository(db).getNoteByPath("d.md");
    db.close();
    expect(tgtRow).toBeUndefined();
  });

  it("rejects non-positive --note-id", async () => {
    const src = makeProject({ name: "src" });
    const tgt = makeProject({ name: "tgt" });
    cleanup.push(src.dir, tgt.dir);

    await transferCommand({
      from: src.dir,
      to: tgt.dir,
      noteId: "abc",
      format: "json",
    });
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(stdoutOutput[0]);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/--note-id must be a positive integer/);
  });

  it("rejects unknown --from project name", async () => {
    const tgt = makeProject({ name: "tgt" });
    cleanup.push(tgt.dir);

    // Move cwd somewhere with no matching .knowledginerc so name resolution fails
    const cwdDir = mkdtempSync(join(tmpdir(), "knowledgine-cli-xfer-cwd-"));
    cleanup.push(cwdDir);
    process.chdir(cwdDir);

    await transferCommand({
      from: "no-such-project",
      to: tgt.dir,
      noteId: "1",
      format: "json",
      path: cwdDir,
    });
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(stdoutOutput[0]);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/--from: unknown project name/);
  });

  it("respects rc file selfName + private allowFrom (denied)", async () => {
    const src = makeProject({ name: "src", seedNote: { filePath: "p.md", title: "P" } });
    const tgt = makeProject({ name: "tgt" });
    cleanup.push(src.dir, tgt.dir);

    const callerRc = mkdtempSync(join(tmpdir(), "knowledgine-cli-xfer-caller-"));
    cleanup.push(callerRc);
    writeRc(callerRc, {
      selfName: "outsider",
      projects: [
        { name: "src", path: src.dir, visibility: "private", allowFrom: ["webapp"] },
        { name: "tgt", path: tgt.dir },
      ],
    });

    const id = (() => {
      const db = createDatabase(join(src.dir, ".knowledgine", "index.sqlite"));
      const x = new KnowledgeRepository(db).getNoteByPath("p.md")!.id;
      db.close();
      return x;
    })();

    await transferCommand({
      from: "src",
      to: "tgt",
      noteId: String(id),
      format: "json",
      path: callerRc,
    });
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(stdoutOutput[0]);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/transfer denied/);
  });

  it("rc file selfName matches private allowFrom (success)", async () => {
    const src = makeProject({ name: "src", seedNote: { filePath: "ok.md", title: "OK" } });
    const tgt = makeProject({ name: "tgt" });
    cleanup.push(src.dir, tgt.dir);

    const callerRc = mkdtempSync(join(tmpdir(), "knowledgine-cli-xfer-allowed-"));
    cleanup.push(callerRc);
    writeRc(callerRc, {
      selfName: "webapp",
      projects: [
        { name: "src", path: src.dir, visibility: "private", allowFrom: ["webapp"] },
        { name: "tgt", path: tgt.dir },
      ],
    });

    const id = (() => {
      const db = createDatabase(join(src.dir, ".knowledgine", "index.sqlite"));
      const x = new KnowledgeRepository(db).getNoteByPath("ok.md")!.id;
      db.close();
      return x;
    })();

    await transferCommand({
      from: "src",
      to: "tgt",
      noteId: String(id),
      format: "json",
      path: callerRc,
    });
    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdoutOutput[0]);
    expect(parsed.ok).toBe(true);
  });

  it("transfer.ts source contains no internal ticket id token (KNOW-)", () => {
    const src = readFileSync(TRANSFER_SOURCE_PATH, "utf-8");
    expect(src).not.toMatch(/KNOW-\d+/);
  });
});
