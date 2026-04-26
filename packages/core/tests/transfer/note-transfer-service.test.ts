import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  ALLOW_PRIVATE_ENV_VAR,
} from "../../src/index.js";
import type { ProjectEntry } from "../../src/storage/project-db.js";
import { NoteTransferService } from "../../src/transfer/note-transfer-service.js";

interface SeedNote {
  filePath: string;
  title: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  patterns?: Array<{ type: "problem" | "solution" | "learning" | "time"; content: string }>;
  embedding?: { f32: Float32Array; modelName: string };
}

function createProjectDir(notes: SeedNote[]): { project: ProjectEntry; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "knowledgine-transfer-test-"));
  const dbPath = join(dir, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repo = new KnowledgeRepository(db);
  for (const seed of notes) {
    const id = repo.saveNote({
      filePath: seed.filePath,
      title: seed.title,
      content: seed.content,
      frontmatter: seed.frontmatter ?? {},
      createdAt: new Date().toISOString(),
    });
    if (seed.patterns?.length) {
      repo.savePatterns(
        id,
        seed.patterns.map((p) => ({ type: p.type, content: p.content, confidence: 0.9 })),
      );
    }
    if (seed.embedding) {
      repo.saveEmbedding(id, seed.embedding.f32, seed.embedding.modelName);
    }
  }
  db.close();
  return { project: { name: "src", path: dir }, dir };
}

function createEmptyTarget(): { project: ProjectEntry; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "knowledgine-transfer-tgt-"));
  const dbPath = join(dir, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  db.close();
  return { project: { name: "tgt", path: dir }, dir };
}

function buildSampleEmbedding(): Float32Array {
  const f = new Float32Array(384);
  for (let i = 0; i < 384; i++) f[i] = Math.sin(i * 0.1) * 0.05;
  return f;
}

function readNote(projectPath: string, filePath: string) {
  const dbPath = join(projectPath, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  try {
    const repo = new KnowledgeRepository(db);
    return repo.getNoteByPath(filePath);
  } finally {
    db.close();
  }
}

function readPatterns(projectPath: string, noteId: number) {
  const dbPath = join(projectPath, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  try {
    return new KnowledgeRepository(db).getPatternsByNoteId(noteId);
  } finally {
    db.close();
  }
}

function readEmbedding(projectPath: string, noteId: number) {
  const dbPath = join(projectPath, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  try {
    const row = db
      .prepare(
        "SELECT note_id, model_name, length(embedding) as bytes FROM note_embeddings WHERE note_id = ?",
      )
      .get(noteId) as { note_id: number; model_name: string; bytes: number } | undefined;
    return row;
  } finally {
    db.close();
  }
}

describe("NoteTransferService.transferNote (copy)", () => {
  const dirs: string[] = [];

  beforeEach(() => {
    delete process.env[ALLOW_PRIVATE_ENV_VAR];
  });

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    delete process.env[ALLOW_PRIVATE_ENV_VAR];
  });

  it("copies a note, its patterns, and its embedding into an empty target", async () => {
    const src = createProjectDir([
      {
        filePath: "guide.md",
        title: "TS Guide",
        content: "Learn TypeScript fundamentals",
        frontmatter: { tags: ["ts", "guide"] },
        patterns: [
          { type: "learning", content: "Always prefer narrow types" },
          { type: "problem", content: "Compiler complains about any" },
        ],
        embedding: { f32: buildSampleEmbedding(), modelName: "all-MiniLM-L6-v2" },
      },
    ]);
    dirs.push(src.dir);
    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);

    const sourceNote = readNote(src.dir, "guide.md")!;
    const svc = new NoteTransferService({ callerSelfName: "callerApp" });
    const result = await svc.transferNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: sourceNote.id,
    });

    expect(result.sourceNoteId).toBe(sourceNote.id);
    expect(result.targetNoteId).toBeGreaterThan(0);
    expect(result.copiedTables).toContain("knowledge_notes");
    expect(result.copiedTables.some((s) => s.startsWith("extracted_patterns"))).toBe(true);
    expect(result.copiedTables).toContain("note_embeddings");

    const copied = readNote(tgt.dir, "guide.md");
    expect(copied).toBeDefined();
    expect(copied!.title).toBe("TS Guide");
    expect(copied!.content).toBe("Learn TypeScript fundamentals");

    const fm = JSON.parse(copied!.frontmatter_json ?? "{}");
    expect(fm.tags).toEqual(["ts", "guide"]);
    expect(fm.transferred_from).toBeDefined();
    expect(fm.transferred_from.project).toBe("callerApp");
    expect(fm.transferred_from.sourceNoteId).toBe(sourceNote.id);
    expect(typeof fm.transferred_from.transferredAt).toBe("string");
    // SECURITY: no absolute path in frontmatter
    expect(JSON.stringify(fm)).not.toContain(src.dir);

    const tgtPatterns = readPatterns(tgt.dir, copied!.id);
    expect(tgtPatterns.length).toBe(2);

    const tgtEmb = readEmbedding(tgt.dir, copied!.id);
    expect(tgtEmb).toBeDefined();
    expect(tgtEmb!.model_name).toBe("all-MiniLM-L6-v2");
    expect(tgtEmb!.bytes).toBe(384 * 4);
  });

  it("rejects (and rolls back) when target already has a note with the same file_path", async () => {
    const src = createProjectDir([
      {
        filePath: "shared.md",
        title: "From Source",
        content: "src body",
      },
    ]);
    dirs.push(src.dir);
    const tgt = createProjectDir([
      {
        filePath: "shared.md",
        title: "Already Here",
        content: "tgt body",
      },
    ]);
    dirs.push(tgt.dir);

    const sourceNote = readNote(src.dir, "shared.md")!;
    const svc = new NoteTransferService({ callerSelfName: "caller" });
    await expect(
      svc.transferNote({
        sourceProject: src.project,
        targetProject: tgt.project,
        sourceNoteId: sourceNote.id,
      }),
    ).rejects.toThrow(/already exists in target/);

    // Target unchanged: still has the original "Already Here"
    const tgtNote = readNote(tgt.dir, "shared.md");
    expect(tgtNote!.title).toBe("Already Here");
    expect(tgtNote!.content).toBe("tgt body");
  });

  it("throws an informative error when source note is missing", async () => {
    const src = createProjectDir([{ filePath: "a.md", title: "A", content: "a" }]);
    dirs.push(src.dir);
    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);

    const svc = new NoteTransferService({ callerSelfName: "caller" });
    await expect(
      svc.transferNote({
        sourceProject: src.project,
        targetProject: tgt.project,
        sourceNoteId: 99999,
      }),
    ).rejects.toThrow(/source note id=99999 not found/);
  });

  it("denies transfer from a private source when caller is not in allowFrom", async () => {
    const src = createProjectDir([{ filePath: "a.md", title: "A", content: "a" }]);
    dirs.push(src.dir);
    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);
    const sourceNote = readNote(src.dir, "a.md")!;

    const svc = new NoteTransferService({ callerSelfName: "intruder" });
    await expect(
      svc.transferNote({
        sourceProject: { ...src.project, visibility: "private", allowFrom: ["webapp"] },
        targetProject: tgt.project,
        sourceNoteId: sourceNote.id,
      }),
    ).rejects.toThrow(/transfer denied/);

    expect(readNote(tgt.dir, "a.md")).toBeUndefined();
  });

  it("permits private-source transfer when caller is in allowFrom", async () => {
    const src = createProjectDir([{ filePath: "a.md", title: "A", content: "a" }]);
    dirs.push(src.dir);
    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);
    const sourceNote = readNote(src.dir, "a.md")!;

    const svc = new NoteTransferService({ callerSelfName: "webapp" });
    const result = await svc.transferNote({
      sourceProject: { ...src.project, visibility: "private", allowFrom: ["webapp"] },
      targetProject: tgt.project,
      sourceNoteId: sourceNote.id,
    });

    expect(result.targetNoteId).toBeGreaterThan(0);
    expect(readNote(tgt.dir, "a.md")).toBeDefined();
  });

  it("dryRun: target is not modified and returns targetNoteId=-1", async () => {
    const src = createProjectDir([{ filePath: "a.md", title: "A", content: "a" }]);
    dirs.push(src.dir);
    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);
    const sourceNote = readNote(src.dir, "a.md")!;

    const svc = new NoteTransferService({ callerSelfName: "caller" });
    const result = await svc.transferNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: sourceNote.id,
      options: { dryRun: true },
    });

    expect(result.targetNoteId).toBe(-1);
    // Target stays empty
    expect(readNote(tgt.dir, "a.md")).toBeUndefined();
  });

  it("two consecutive transfers of the same source produce distinct target ids (no idempotency)", async () => {
    const src = createProjectDir([{ filePath: "first.md", title: "T1", content: "c1" }]);
    dirs.push(src.dir);
    const src2 = createProjectDir([{ filePath: "second.md", title: "T2", content: "c2" }]);
    dirs.push(src2.dir);
    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);

    const note1 = readNote(src.dir, "first.md")!;
    const note2 = readNote(src2.dir, "second.md")!;

    const svc = new NoteTransferService({ callerSelfName: "caller" });
    const r1 = await svc.transferNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: note1.id,
    });
    const r2 = await svc.transferNote({
      sourceProject: src2.project,
      targetProject: tgt.project,
      sourceNoteId: note2.id,
    });
    expect(r2.targetNoteId).not.toBe(r1.targetNoteId);
  });

  it("warns when source has note_links (single-note transfer drops the other end)", async () => {
    // Two notes in source linked to each other; transfer only the first.
    const src = createProjectDir([
      { filePath: "a.md", title: "A", content: "a" },
      { filePath: "b.md", title: "B", content: "b" },
    ]);
    dirs.push(src.dir);
    // Add a link a→b in source
    {
      const dbPath = join(src.dir, ".knowledgine", "index.sqlite");
      const db = createDatabase(dbPath);
      const repo = new KnowledgeRepository(db);
      const a = repo.getNoteByPath("a.md")!;
      const b = repo.getNoteByPath("b.md")!;
      repo.saveNoteLinks([{ sourceNoteId: a.id, targetNoteId: b.id, linkType: "related" }]);
      db.close();
    }

    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);
    const sourceA = readNote(src.dir, "a.md")!;

    const svc = new NoteTransferService({ callerSelfName: "caller" });
    const result = await svc.transferNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: sourceA.id,
    });

    expect(result.warnings.some((w) => /note_link/i.test(w))).toBe(true);
  });

  it("copies problem_solution_pairs whose both endpoints are inside this note", async () => {
    const src = createProjectDir([
      {
        filePath: "psp.md",
        title: "PSP host",
        content: "see patterns",
        patterns: [
          { type: "problem", content: "P-A" },
          { type: "solution", content: "S-A" },
        ],
      },
    ]);
    dirs.push(src.dir);
    // Add a psp pair in source between the two patterns of this note
    {
      const dbPath = join(src.dir, ".knowledgine", "index.sqlite");
      const db = createDatabase(dbPath);
      const repo = new KnowledgeRepository(db);
      const note = repo.getNoteByPath("psp.md")!;
      const pats = repo.getPatternsByNoteId(note.id);
      const problem = pats.find((p) => p.pattern_type === "problem")!;
      const solution = pats.find((p) => p.pattern_type === "solution")!;
      repo.saveProblemSolutionPairs([
        { problemPatternId: problem.id, solutionPatternId: solution.id, relevanceScore: 0.85 },
      ]);
      db.close();
    }

    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);
    const sourceNote = readNote(src.dir, "psp.md")!;

    const svc = new NoteTransferService({ callerSelfName: "caller" });
    const result = await svc.transferNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: sourceNote.id,
    });
    expect(result.copiedTables.some((s) => s.startsWith("problem_solution_pairs"))).toBe(true);

    // Verify the psp row is present in target with mapped (new) pattern ids
    {
      const dbPath = join(tgt.dir, ".knowledgine", "index.sqlite");
      const db = createDatabase(dbPath);
      const row = db.prepare("SELECT COUNT(*) AS c FROM problem_solution_pairs").get() as {
        c: number;
      };
      expect(row.c).toBe(1);
      db.close();
    }
  });

  it("KNOWLEDGINE_ALLOW_PRIVATE=1 bypasses visibility (with stderr warning)", async () => {
    const src = createProjectDir([{ filePath: "a.md", title: "A", content: "a" }]);
    dirs.push(src.dir);
    const tgt = createEmptyTarget();
    dirs.push(tgt.dir);
    const sourceNote = readNote(src.dir, "a.md")!;

    process.env[ALLOW_PRIVATE_ENV_VAR] = "1";
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const svc = new NoteTransferService({ callerSelfName: "intruder" });
      const result = await svc.transferNote({
        sourceProject: { ...src.project, visibility: "private", allowFrom: [] },
        targetProject: tgt.project,
        sourceNoteId: sourceNote.id,
      });
      expect(result.targetNoteId).toBeGreaterThan(0);
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes("KNOWLEDGINE_ALLOW_PRIVATE"))).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
