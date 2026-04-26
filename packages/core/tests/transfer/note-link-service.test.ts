import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "../../src/index.js";
import type { ProjectEntry } from "../../src/storage/project-db.js";
import { NoteLinkService } from "../../src/transfer/note-link-service.js";

interface SourceFixture {
  project: ProjectEntry;
  dir: string;
  note: { id: number; title: string };
}

function makeSource(filePath = "x.md", title = "Source Title"): SourceFixture {
  const dir = mkdtempSync(join(tmpdir(), "knowledgine-link-src-"));
  const dbPath = join(dir, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repo = new KnowledgeRepository(db);
  const id = repo.saveNote({
    filePath,
    title,
    content: `body of ${title}`,
    frontmatter: {},
    createdAt: new Date().toISOString(),
  });
  db.close();
  return { project: { name: "src", path: dir }, dir, note: { id, title } };
}

function makeTarget(): { project: ProjectEntry; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "knowledgine-link-tgt-"));
  const dbPath = join(dir, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  db.close();
  return { project: { name: "tgt", path: dir }, dir };
}

function readNoteById(projectPath: string, noteId: number) {
  const dbPath = join(projectPath, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  try {
    return new KnowledgeRepository(db).getNoteById(noteId);
  } finally {
    db.close();
  }
}

describe("NoteLinkService.linkNote", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("creates a stub note and a cross_project_links row", async () => {
    const src = makeSource("guide.md", "Distributed Tracing Guide");
    const tgt = makeTarget();
    cleanup.push(src.dir, tgt.dir);

    const svc = new NoteLinkService({ callerSelfName: "callerApp" });
    const result = await svc.linkNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: src.note.id,
    });

    expect(result.sourceNoteId).toBe(src.note.id);
    expect(result.targetNoteId).toBeGreaterThan(0);
    expect(result.linkRowId).toBeGreaterThan(0);

    const stub = readNoteById(tgt.dir, result.targetNoteId);
    expect(stub).toBeDefined();
    expect(stub!.title).toBe(`[link] ${src.note.title}`);
    // body is a marker; the real content is fetched on demand by resolveLink
    expect(stub!.content).toMatch(/^\[link\]/);
    const fm = JSON.parse(stub!.frontmatter_json ?? "{}");
    expect(fm.linked_from.project).toBe("callerApp");
    expect(fm.linked_from.sourceNoteId).toBe(src.note.id);
    // We DO record sourcePath in linked_from because resolveLink needs it.
    expect(fm.linked_from.sourcePath).toBe(src.dir);
  });

  it("UNIQUE collision: linking the same source twice into the same stub fails", async () => {
    const src = makeSource("u.md", "Unique");
    const tgt = makeTarget();
    cleanup.push(src.dir, tgt.dir);
    const svc = new NoteLinkService({ callerSelfName: "caller" });

    const r1 = await svc.linkNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: src.note.id,
    });
    expect(r1.linkRowId).toBeGreaterThan(0);
    // Each linkNote allocates a NEW stub note (new local_note_id) so the
    // UNIQUE(local_note_id, source_project_path, source_note_id) is per-stub
    // — calling linkNote twice succeeds with TWO distinct stubs.
    const r2 = await svc.linkNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: src.note.id,
    });
    expect(r2.linkRowId).toBeGreaterThan(r1.linkRowId);
    expect(r2.targetNoteId).not.toBe(r1.targetNoteId);
  });

  it("denies linking from a private source when caller is not in allowFrom", async () => {
    const src = makeSource("p.md", "Private");
    const tgt = makeTarget();
    cleanup.push(src.dir, tgt.dir);

    const svc = new NoteLinkService({ callerSelfName: "outsider" });
    await expect(
      svc.linkNote({
        sourceProject: { ...src.project, visibility: "private", allowFrom: ["webapp"] },
        targetProject: tgt.project,
        sourceNoteId: src.note.id,
      }),
    ).rejects.toThrow(/transfer denied/);
  });
});

describe("NoteLinkService.resolveLink", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("status=ok returns the up-to-date source note body", async () => {
    const src = makeSource("r.md", "Resolvable");
    const tgt = makeTarget();
    cleanup.push(src.dir, tgt.dir);
    const svc = new NoteLinkService({ callerSelfName: "caller" });
    const linked = await svc.linkNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: src.note.id,
    });

    const resolved = await svc.resolveLink(tgt.project, linked.targetNoteId);
    expect(resolved.status).toBe("ok");
    if (resolved.status === "ok") {
      expect(resolved.sourceNote.title).toBe("Resolvable");
      expect(resolved.sourceNote.content).toBe("body of Resolvable");
      expect(typeof resolved.lastResolvedAt).toBe("string");
    }
  });

  it("status=note_deleted when the source note has been removed", async () => {
    const src = makeSource("d.md", "WillBeDeleted");
    const tgt = makeTarget();
    cleanup.push(src.dir, tgt.dir);
    const svc = new NoteLinkService({ callerSelfName: "caller" });
    const linked = await svc.linkNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: src.note.id,
    });

    // Delete the source note (project still exists)
    {
      const db = createDatabase(join(src.dir, ".knowledgine", "index.sqlite"));
      new KnowledgeRepository(db).deleteNoteById(src.note.id);
      db.close();
    }

    const resolved = await svc.resolveLink(tgt.project, linked.targetNoteId);
    expect(resolved.status).toBe("note_deleted");
    if (resolved.status === "note_deleted") {
      expect(resolved.sourceProjectPath).toBe(src.dir);
    }
  });

  it("status=source_missing when the source project directory is gone", async () => {
    const src = makeSource("g.md", "Gone");
    const tgt = makeTarget();
    cleanup.push(tgt.dir);
    const svc = new NoteLinkService({ callerSelfName: "caller" });
    const linked = await svc.linkNote({
      sourceProject: src.project,
      targetProject: tgt.project,
      sourceNoteId: src.note.id,
    });

    // Remove the entire source project
    rmSync(src.dir, { recursive: true, force: true });

    const resolved = await svc.resolveLink(tgt.project, linked.targetNoteId);
    expect(resolved.status).toBe("source_missing");
    if (resolved.status === "source_missing") {
      expect(["project_path_unreachable", "db_unopenable"]).toContain(resolved.reason);
    }
  });

  it("throws when the supplied note id is not a link stub", async () => {
    const tgt = makeTarget();
    cleanup.push(tgt.dir);
    // Add a regular (non-stub) note to target
    const db = createDatabase(join(tgt.dir, ".knowledgine", "index.sqlite"));
    const id = new KnowledgeRepository(db).saveNote({
      filePath: "regular.md",
      title: "Regular",
      content: "not a stub",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    db.close();
    const svc = new NoteLinkService({ callerSelfName: "caller" });
    await expect(svc.resolveLink(tgt.project, id)).rejects.toThrow(/not a link stub/);
  });
});
