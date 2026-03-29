import { join } from "path";
import { existsSync } from "fs";
import Database from "better-sqlite3";
import { KnowledgeRepository } from "../storage/knowledge-repository.js";

export interface ProjectEntry {
  name: string;
  path: string;
}

export interface CrossProjectResult {
  noteId: number;
  title: string;
  content: string;
  score: number;
  projectName: string;
}

const MINIMUM_COMPATIBLE_VERSION = 8; // migration 008 (knowledge_versioning) 以降
const MAX_CONNECTIONS = 10;

export class CrossProjectSearcher {
  constructor(private projects: ProjectEntry[]) {}

  async search(query: string, options?: { limit?: number }): Promise<CrossProjectResult[]> {
    const limit = options?.limit ?? 20;
    const allResults: CrossProjectResult[] = [];
    const projectsToSearch = this.projects.slice(0, MAX_CONNECTIONS);

    for (const project of projectsToSearch) {
      let db: Database.Database | undefined;
      try {
        const dbPath = join(project.path, ".knowledgine", "index.sqlite");
        if (!existsSync(dbPath)) {
          console.warn(`Project ${project.name}: database not found, skipping`);
          continue;
        }

        db = new Database(dbPath, { readonly: true });

        // schema_version テーブルの最大バージョンを確認
        let version = 0;
        try {
          const row = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as
            | { version: number | null }
            | undefined;
          version = row?.version ?? 0;
        } catch {
          console.warn(`Project ${project.name}: cannot read schema_version, skipping`);
          continue;
        }

        if (version < MINIMUM_COMPATIBLE_VERSION) {
          console.warn(
            `Project ${project.name}: schema version ${version} < ${MINIMUM_COMPATIBLE_VERSION}, skipping`,
          );
          continue;
        }

        const repo = new KnowledgeRepository(db);
        const rows = repo.searchNotesWithRank(query, limit);

        for (const { note, rank } of rows) {
          allResults.push({
            noteId: note.id,
            title: note.title,
            content: note.content.slice(0, 500),
            // FTS5 rank is negative (more negative = better match); negate for ascending sort
            score: -(rank ?? 0),
            projectName: project.name,
          });
        }
      } catch (err) {
        console.warn(
          `Project ${project.name}: search failed - ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        db?.close();
      }
    }

    // スコア降順ソート + limit 適用
    return allResults.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
