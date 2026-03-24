import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import type { KnowledgeNote } from "@knowledgine/core";

export interface DeprecationCheckOptions {
  path?: string;
  apply?: boolean;
  threshold?: string;
}

interface SimilarityCandidate {
  note: KnowledgeNote;
  supersededBy: KnowledgeNote;
  similarity: number;
}

/**
 * 簡易テキスト類似度（Jaccard係数）でdeprecation候補を検出する
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 2),
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export async function deprecationCheckCommand(options: DeprecationCheckOptions): Promise<void> {
  const threshold = parseFloat(options.threshold ?? "0.8");
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    console.error("Error: --threshold must be a number between 0 and 1");
    process.exit(1);
  }

  const rootPath = resolveDefaultPath(options.path);
  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);

  try {
    const allNotes = repository.getAllNotes().filter((n) => !n.deprecated);
    const candidates: SimilarityCandidate[] = [];

    // O(n²) comparison — intended for small knowledge bases
    // For large bases, use findNotesByTimeProximity() as pre-filter
    for (let i = 0; i < allNotes.length; i++) {
      for (let j = i + 1; j < allNotes.length; j++) {
        const older = allNotes[i];
        const newer = allNotes[j];

        // newer note (higher id / later created_at) supersedes older
        const newerNote = newer.created_at > older.created_at ? newer : older;
        const olderNote = newer.created_at > older.created_at ? older : newer;

        const sim = jaccardSimilarity(
          `${olderNote.title} ${olderNote.content}`,
          `${newerNote.title} ${newerNote.content}`,
        );

        if (sim >= threshold) {
          candidates.push({ note: olderNote, supersededBy: newerNote, similarity: sim });
        }
      }
    }

    if (candidates.length === 0) {
      console.log("No deprecation candidates found.");
      return;
    }

    console.log(`Found ${candidates.length} deprecation candidate(s) (threshold: ${threshold}):\n`);

    for (const c of candidates) {
      console.log(
        `  [${c.note.id}] "${c.note.title}" → superseded by [${c.supersededBy.id}] "${c.supersededBy.title}" (similarity: ${c.similarity.toFixed(3)})`,
      );
    }

    if (options.apply) {
      console.log("\nApplying deprecation...");
      for (const c of candidates) {
        db.prepare(
          "UPDATE knowledge_notes SET deprecated = 1, deprecation_reason = ? WHERE id = ?",
        ).run(`Superseded by note ${c.supersededBy.id}: ${c.supersededBy.title}`, c.note.id);
        console.log(`  Deprecated note ${c.note.id}: "${c.note.title}"`);
      }
      console.log("Done.");
    } else {
      console.log("\nRun with --apply to apply these changes.");
    }
  } finally {
    db.close();
  }
}
