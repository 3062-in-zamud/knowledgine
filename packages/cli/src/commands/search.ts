import { resolve } from "path";
import { existsSync } from "fs";
import {
  loadConfig,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  KnowledgeSearcher,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import { getDemoNotesPath } from "./demo.js";

export interface SearchCommandOptions {
  demo?: boolean;
  mode?: string;
  limit?: number;
}

export async function searchCommand(
  query: string,
  options: SearchCommandOptions,
): Promise<void> {
  const rootPath = options.demo
    ? getDemoNotesPath()
    : resolve(process.cwd());

  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(
      options.demo
        ? 'Demo not initialized. Run "knowledgine init --demo" first.'
        : 'Not initialized. Run "knowledgine init --path <dir>" first.',
    );
    return;
  }

  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();

  const repository = new KnowledgeRepository(db);
  const searcher = new KnowledgeSearcher(repository);

  const mode = (options.mode as "keyword" | "semantic" | "hybrid") ?? "keyword";
  const limit = options.limit ?? 20;

  const results = await searcher.search({ query, mode, limit });

  formatSearchResults(query, results);

  db.close();
}

export function formatSearchResults(
  query: string,
  results: Awaited<ReturnType<KnowledgeSearcher["search"]>>,
): void {
  if (results.length === 0) {
    console.error(`No results for "${query}".`);
    return;
  }

  console.error(`Results for "${query}" (${results.length} matches):`);
  console.error("");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = r.score.toFixed(2);
    // KnowledgeNote uses snake_case (file_path) from the DB row
    const note = r.note as unknown as { file_path: string; title: string };
    console.error(`  ${i + 1}. [${score}] ${note.file_path}`);
    console.error(`     ${note.title}`);
    console.error("");
  }
}
