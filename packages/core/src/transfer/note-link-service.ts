import {
  openProjectDb,
  describeOpenProjectDbError,
  type ProjectEntry,
} from "../storage/project-db.js";
import { canTransferFrom } from "../access/visibility-gate.js";
import { KnowledgeRepository, type KnowledgeNote } from "../storage/knowledge-repository.js";

export interface LinkResult {
  sourceNoteId: number;
  /** Local id of the link stub note in the target project. */
  targetNoteId: number;
  /** Row id in the target project's `cross_project_links` table. */
  linkRowId: number;
}

export type ResolveResult =
  | { status: "ok"; sourceNote: KnowledgeNote; lastResolvedAt: string }
  | { status: "source_missing"; reason: "project_path_unreachable" | "db_unopenable" }
  | { status: "note_deleted"; sourceProjectPath: string };

interface CrossProjectLinkRow {
  id: number;
  local_note_id: number;
  source_project_name: string | null;
  source_project_path: string;
  source_note_id: number;
  link_type: string;
  metadata_json: string | null;
}

/**
 * Cross-project lazy reference (KNOW-338 AC-3 part 2).
 *
 * `linkNote` writes a lightweight stub into the target project plus a
 * row in `cross_project_links`. `resolveLink` is read-mostly: it opens
 * the source project on demand to fetch the live body, returning a
 * discriminated `ResolveResult` so callers can render `[broken link]`
 * cleanly when the source is missing.
 */
export class NoteLinkService {
  constructor(private opts: { callerSelfName: string | null }) {}

  async linkNote(input: {
    sourceProject: ProjectEntry;
    targetProject: ProjectEntry;
    sourceNoteId: number;
  }): Promise<LinkResult> {
    const callerSelfName = this.opts.callerSelfName;

    if (!canTransferFrom(callerSelfName, input.sourceProject)) {
      throw new Error(
        `transfer denied: source project "${input.sourceProject.name}" is private and ` +
          `allowFrom does not include caller "${callerSelfName ?? "<anonymous>"}"`,
      );
    }

    const source = openProjectDb(input.sourceProject, { mode: "readSource" });
    if (!source.ok) {
      throw new Error(describeOpenProjectDbError(input.sourceProject, source.error));
    }

    try {
      const srcRepo = new KnowledgeRepository(source.db);
      const sourceNote = srcRepo.getNoteById(input.sourceNoteId);
      if (!sourceNote) {
        throw new Error(
          `source note id=${input.sourceNoteId} not found in project "${input.sourceProject.name}"`,
        );
      }

      const targetOpened = openProjectDb(input.targetProject, { mode: "writeLink" });
      if (!targetOpened.ok) {
        throw new Error(describeOpenProjectDbError(input.targetProject, targetOpened.error));
      }

      try {
        const tgtRepo = new KnowledgeRepository(targetOpened.db);
        const now = new Date().toISOString();

        // Insert stub note + link row in a single target transaction.
        let stubId = -1;
        let linkRowId = -1;
        const txn = targetOpened.db.transaction(() => {
          const stubFilePath = `__links__/${input.sourceProject.name}-${input.sourceNoteId}-${Date.now()}.link.md`;
          stubId = tgtRepo.saveNote({
            filePath: stubFilePath,
            title: `[link] ${sourceNote.title}`,
            // saveNote rejects empty strings; the body is fetched on demand
            // by resolveLink, so we keep this placeholder short and obvious.
            content: `[link] -> ${input.sourceProject.name}:${input.sourceNoteId}`,
            frontmatter: {
              linked_from: {
                project: callerSelfName,
                sourceNoteId: input.sourceNoteId,
                sourcePath: input.sourceProject.path,
              },
            },
            createdAt: now,
          });

          const info = targetOpened.db
            .prepare(
              `INSERT INTO cross_project_links
                 (local_note_id, source_project_name, source_project_path, source_note_id,
                  link_type, metadata_json, created_at)
               VALUES (?, ?, ?, ?, 'reference', ?, ?)`,
            )
            .run(
              stubId,
              input.sourceProject.name,
              input.sourceProject.path,
              input.sourceNoteId,
              JSON.stringify({ sourceTitle: sourceNote.title, linkedAt: now }),
              now,
            );
          linkRowId = Number(info.lastInsertRowid);
        });
        txn();

        return {
          sourceNoteId: input.sourceNoteId,
          targetNoteId: stubId,
          linkRowId,
        };
      } finally {
        targetOpened.db.close();
      }
    } finally {
      source.db.close();
    }
  }

  async resolveLink(targetProject: ProjectEntry, linkStubNoteId: number): Promise<ResolveResult> {
    const target = openProjectDb(targetProject, { mode: "writeLink" });
    if (!target.ok) {
      throw new Error(describeOpenProjectDbError(targetProject, target.error));
    }

    try {
      const linkRow = target.db
        .prepare(
          `SELECT id, local_note_id, source_project_name, source_project_path,
                  source_note_id, link_type, metadata_json
           FROM cross_project_links WHERE local_note_id = ?`,
        )
        .get(linkStubNoteId) as CrossProjectLinkRow | undefined;

      if (!linkRow) {
        throw new Error(
          `note id ${linkStubNoteId} is not a link stub (no cross_project_links row)`,
        );
      }

      const stamp = new Date().toISOString();
      const updateMetadata = (patch: Record<string, unknown>): void => {
        const merged: Record<string, unknown> = linkRow.metadata_json
          ? (JSON.parse(linkRow.metadata_json) as Record<string, unknown>)
          : {};
        for (const [k, v] of Object.entries(patch)) merged[k] = v;
        target.db
          .prepare("UPDATE cross_project_links SET metadata_json = ? WHERE id = ?")
          .run(JSON.stringify(merged), linkRow.id);
      };

      const sourceProject: ProjectEntry = {
        name: linkRow.source_project_name ?? "<unnamed>",
        path: linkRow.source_project_path,
      };
      const sourceOpened = openProjectDb(sourceProject, { mode: "readSource" });
      if (!sourceOpened.ok) {
        const reason: ResolveResult & { status: "source_missing" } = {
          status: "source_missing",
          reason:
            sourceOpened.error.kind === "missing_path"
              ? "project_path_unreachable"
              : "db_unopenable",
        };
        updateMetadata({ lastError: { reason: reason.reason, observedAt: stamp } });
        return reason;
      }

      try {
        const srcRepo = new KnowledgeRepository(sourceOpened.db);
        const sourceNote = srcRepo.getNoteById(linkRow.source_note_id);
        if (!sourceNote) {
          updateMetadata({ lastError: { reason: "note_deleted", observedAt: stamp } });
          return { status: "note_deleted", sourceProjectPath: linkRow.source_project_path };
        }
        updateMetadata({ lastResolvedAt: stamp });
        return { status: "ok", sourceNote, lastResolvedAt: stamp };
      } finally {
        sourceOpened.db.close();
      }
    } finally {
      target.db.close();
    }
  }
}
