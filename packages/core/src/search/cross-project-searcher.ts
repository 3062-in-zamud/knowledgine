import { KnowledgeRepository } from "../storage/knowledge-repository.js";
import { openProjectDb, PROJECT_DB_FLOORS } from "../storage/project-db.js";

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

const MAX_CONNECTIONS = 10;

export class CrossProjectSearcher {
  constructor(private projects: ProjectEntry[]) {}

  async search(query: string, options?: { limit?: number }): Promise<CrossProjectResult[]> {
    const limit = options?.limit ?? 20;
    const allResults: CrossProjectResult[] = [];
    const projectsToSearch = this.projects.slice(0, MAX_CONNECTIONS);

    for (const project of projectsToSearch) {
      const opened = openProjectDb(project, { mode: "readSource" });

      if (!opened.ok) {
        switch (opened.error.kind) {
          case "missing_path":
            console.warn(`Project ${project.name}: database not found, skipping`);
            break;
          case "invalid_schema_version":
            console.warn(`Project ${project.name}: cannot read schema_version, skipping`);
            break;
          case "version_too_low":
            console.warn(
              `Project ${project.name}: schema version ${opened.error.version} < ${PROJECT_DB_FLOORS.readSource}, skipping`,
            );
            break;
        }
        continue;
      }

      try {
        const repo = new KnowledgeRepository(opened.db);
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
        opened.db.close();
      }
    }

    // スコア降順ソート + limit 適用
    return allResults.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
