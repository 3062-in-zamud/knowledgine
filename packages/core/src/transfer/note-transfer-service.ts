import {
  openProjectDb,
  describeOpenProjectDbError,
  type ProjectEntry,
  type ProjectDbHandle,
} from "../storage/project-db.js";
import { canTransferFrom } from "../access/visibility-gate.js";
import { KnowledgeRepository } from "../storage/knowledge-repository.js";
import type { ExtractedPattern, PatternType } from "../types.js";

const FLOAT32_BYTES_PER_DIM = 4;

export interface TransferOptions {
  dryRun?: boolean;
}

export interface TransferResult {
  sourceNoteId: number;
  targetNoteId: number;
  copiedTables: string[];
  skipped: string[];
  warnings: string[];
}

interface SourceEmbeddingRow {
  embedding: Buffer;
  model_name: string;
  dimensions: number;
}

interface SourcePatternRow {
  id: number;
  pattern_type: string;
  content: string;
  confidence: number;
  context: string | null;
  line_number: number | null;
}

/**
 * Cross-project copy of a single note (KNOW-338 AC-3 part 1).
 *
 * Reads from the source project read-only, writes the entire copy into a
 * single SQLite transaction on the target. The vec0 mirror is updated by
 * `KnowledgeRepository.saveEmbedding` (re-encoding INT8 from the float32
 * BLOB) so partial failures roll back both `note_embeddings` and
 * `note_embeddings_vec` together — verified by the vec0 rollback spike
 * (see `tests/storage/vec0-rollback-spike.test.ts`).
 */
export class NoteTransferService {
  constructor(private opts: { callerSelfName: string | null }) {}

  async transferNote(input: {
    sourceProject: ProjectEntry;
    targetProject: ProjectEntry;
    sourceNoteId: number;
    options?: TransferOptions;
  }): Promise<TransferResult> {
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

    let target: ProjectDbHandle | null = null;
    try {
      const targetOpened = openProjectDb(input.targetProject, { mode: "writeCopy" });
      if (!targetOpened.ok) {
        throw new Error(describeOpenProjectDbError(input.targetProject, targetOpened.error));
      }
      target = {
        db: targetOpened.db,
        schemaVersion: targetOpened.schemaVersion,
        path: targetOpened.path,
      };

      const srcRepo = new KnowledgeRepository(source.db);
      const sourceNote = srcRepo.getNoteById(input.sourceNoteId);
      if (!sourceNote) {
        throw new Error(
          `source note id=${input.sourceNoteId} not found in project "${input.sourceProject.name}"`,
        );
      }

      const tgtRepo = new KnowledgeRepository(target.db);
      const collision = tgtRepo.getNoteByPath(sourceNote.file_path);
      if (collision) {
        throw new Error(
          `note with file_path "${sourceNote.file_path}" already exists in target ` +
            `(note id ${collision.id}); use --rename or remove duplicate first`,
        );
      }

      // Read source-side payloads outside the target transaction.
      const sourcePatterns = source.db
        .prepare(
          "SELECT id, pattern_type, content, confidence, context, line_number FROM extracted_patterns WHERE note_id = ? ORDER BY id",
        )
        .all(input.sourceNoteId) as SourcePatternRow[];

      const sourceEmbedding = source.db
        .prepare("SELECT embedding, model_name, dimensions FROM note_embeddings WHERE note_id = ?")
        .get(input.sourceNoteId) as SourceEmbeddingRow | undefined;

      const sourceLinkCount = source.db
        .prepare(
          "SELECT COUNT(*) AS c FROM note_links WHERE source_note_id = ? OR target_note_id = ?",
        )
        .get(input.sourceNoteId, input.sourceNoteId) as { c: number } | undefined;

      // Total psp involving this note (either endpoint), and the in-note
      // subset (both endpoints in this note) which is the part we can
      // safely copy in a single-note transfer.
      const sourcePspCount = source.db
        .prepare(
          `SELECT COUNT(*) AS c
           FROM problem_solution_pairs psp
           JOIN extracted_patterns ep1 ON psp.problem_pattern_id = ep1.id
           JOIN extracted_patterns ep2 ON psp.solution_pattern_id = ep2.id
           WHERE ep1.note_id = ? OR ep2.note_id = ?`,
        )
        .get(input.sourceNoteId, input.sourceNoteId) as { c: number } | undefined;

      const sourceInNotePsps = source.db
        .prepare(
          `SELECT psp.problem_pattern_id, psp.solution_pattern_id, psp.relevance_score
           FROM problem_solution_pairs psp
           JOIN extracted_patterns ep1 ON psp.problem_pattern_id = ep1.id
           JOIN extracted_patterns ep2 ON psp.solution_pattern_id = ep2.id
           WHERE ep1.note_id = ? AND ep2.note_id = ?`,
        )
        .all(input.sourceNoteId, input.sourceNoteId) as Array<{
        problem_pattern_id: number;
        solution_pattern_id: number;
        relevance_score: number;
      }>;

      const frontmatter: Record<string, unknown> = sourceNote.frontmatter_json
        ? (JSON.parse(sourceNote.frontmatter_json) as Record<string, unknown>)
        : {};
      const targetFrontmatter: Record<string, unknown> = {
        ...frontmatter,
        transferred_from: {
          project: callerSelfName,
          sourceNoteId: input.sourceNoteId,
          transferredAt: new Date().toISOString(),
        },
      };

      const copiedTables: string[] = [];
      const skipped: string[] = [];
      const warnings: string[] = [];

      // Dry-run: compute the report without writing.
      if (input.options?.dryRun) {
        copiedTables.push("knowledge_notes");
        if (sourcePatterns.length > 0) {
          copiedTables.push(`extracted_patterns (n=${sourcePatterns.length})`);
        }
        if (sourceEmbedding) {
          copiedTables.push("note_embeddings");
        } else {
          skipped.push("note_embeddings (source has no embedding)");
        }
        if ((sourceLinkCount?.c ?? 0) > 0) {
          warnings.push(
            `would drop ${sourceLinkCount?.c ?? 0} note_link(s) (single-note transfer; ` +
              `the other end is not copied in this run)`,
          );
        }
        const totalPsp = sourcePspCount?.c ?? 0;
        const inNotePsp = sourceInNotePsps.length;
        const crossNotePsp = totalPsp - inNotePsp;
        if (inNotePsp > 0) {
          copiedTables.push(`problem_solution_pairs (n=${inNotePsp})`);
        }
        if (crossNotePsp > 0) {
          warnings.push(
            `would drop ${crossNotePsp} problem_solution_pair(s) (other endpoint is in a different note)`,
          );
        }
        return {
          sourceNoteId: input.sourceNoteId,
          targetNoteId: -1,
          copiedTables,
          skipped,
          warnings,
        };
      }

      let newTargetNoteId = -1;
      const transaction = target.db.transaction(() => {
        // Pass 1a: knowledge_notes
        newTargetNoteId = tgtRepo.saveNote({
          filePath: sourceNote.file_path,
          title: sourceNote.title,
          content: sourceNote.content,
          frontmatter: targetFrontmatter,
          createdAt: sourceNote.created_at,
        });
        copiedTables.push("knowledge_notes");

        // Pass 1b: extracted_patterns (mapped to new note id)
        if (sourcePatterns.length > 0) {
          const payload: ExtractedPattern[] = sourcePatterns.map((p) => ({
            type: p.pattern_type as PatternType,
            content: p.content,
            confidence: p.confidence,
            context: p.context ?? undefined,
            lineNumber: p.line_number ?? undefined,
          }));
          tgtRepo.savePatterns(newTargetNoteId, payload);
          copiedTables.push(`extracted_patterns (n=${sourcePatterns.length})`);
        }

        // Pass 1c: note_embeddings (float32 BLOB) + note_embeddings_vec (INT8 mirror)
        if (sourceEmbedding && sourceEmbedding.embedding) {
          const buf = sourceEmbedding.embedding;
          const dim = sourceEmbedding.dimensions ?? buf.length / FLOAT32_BYTES_PER_DIM;
          const f32 = new Float32Array(buf.buffer, buf.byteOffset, dim);
          tgtRepo.saveEmbedding(newTargetNoteId, f32, sourceEmbedding.model_name);
          copiedTables.push("note_embeddings");
        } else {
          skipped.push("note_embeddings (source has no embedding)");
        }

        // Pass 2: note_links — the other end is by definition not in this
        // run for single-note transfer; warn and drop.
        if ((sourceLinkCount?.c ?? 0) > 0) {
          warnings.push(
            `dropped ${sourceLinkCount?.c ?? 0} note_link(s) (single-note transfer; ` +
              `the other end was not copied in this run)`,
          );
        }

        // Pass 2: problem_solution_pairs whose BOTH endpoints are in this
        // note. Map source pattern ids -> target pattern ids using the
        // (pattern_type, content, line_number) composite key, then insert.
        // psps with the other endpoint in a different note are warned + dropped.
        const totalSourcePsp = sourcePspCount?.c ?? 0;
        const inNoteSourcePsp = sourceInNotePsps.length;
        const crossNoteSourcePsp = totalSourcePsp - inNoteSourcePsp;
        if (inNoteSourcePsp > 0) {
          const newPatterns = tgtRepo.getPatternsByNoteId(newTargetNoteId);
          const keyOf = (p: {
            pattern_type: string;
            content: string;
            line_number: number | null;
          }): string => `${p.pattern_type}|${p.content}|${p.line_number ?? "_"}`;
          const newPatternIdByKey = new Map<string, number>();
          for (const np of newPatterns) newPatternIdByKey.set(keyOf(np), np.id);
          const oldToNew = new Map<number, number>();
          for (const sp of sourcePatterns) {
            const newId = newPatternIdByKey.get(keyOf(sp));
            if (newId !== undefined) oldToNew.set(sp.id, newId);
          }

          const mappedPairs: Array<{
            problemPatternId: number;
            solutionPatternId: number;
            relevanceScore: number;
          }> = [];
          let unmappedPspCount = 0;
          for (const psp of sourceInNotePsps) {
            const np = oldToNew.get(psp.problem_pattern_id);
            const ns = oldToNew.get(psp.solution_pattern_id);
            if (np !== undefined && ns !== undefined) {
              mappedPairs.push({
                problemPatternId: np,
                solutionPatternId: ns,
                relevanceScore: psp.relevance_score,
              });
            } else {
              unmappedPspCount++;
            }
          }
          if (mappedPairs.length > 0) {
            tgtRepo.saveProblemSolutionPairs(mappedPairs);
            copiedTables.push(`problem_solution_pairs (n=${mappedPairs.length})`);
          }
          if (unmappedPspCount > 0) {
            warnings.push(
              `dropped ${unmappedPspCount} problem_solution_pair(s) (could not map pattern ids)`,
            );
          }
        }
        if (crossNoteSourcePsp > 0) {
          warnings.push(
            `dropped ${crossNoteSourcePsp} problem_solution_pair(s) (other endpoint is in a different note)`,
          );
        }
      });

      transaction();

      return {
        sourceNoteId: input.sourceNoteId,
        targetNoteId: newTargetNoteId,
        copiedTables,
        skipped,
        warnings,
      };
    } finally {
      source.db.close();
      target?.db.close();
    }
  }
}
