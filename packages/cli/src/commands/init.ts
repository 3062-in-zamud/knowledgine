import { resolve } from "path";
import { mkdirSync } from "fs";
import {
  defineConfig,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import { indexAll } from "../lib/indexer.js";

export interface InitOptions {
  path?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const rootPath = resolve(options.path ?? process.cwd());

  // Create .knowledgine directory
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  mkdirSync(knowledgineDir, { recursive: true });

  // Initialize database
  const config = defineConfig({ rootPath });
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);

  // Index all markdown files
  const summary = await indexAll(rootPath, repository);

  // Display summary (stderr to avoid MCP stdout conflicts)
  console.error(`Indexing complete:`);
  console.error(`  Files:    ${summary.processedFiles}/${summary.totalFiles}`);
  console.error(`  Patterns: ${summary.totalPatterns}`);
  console.error(`  Time:     ${summary.elapsedMs}ms`);

  if (summary.errors.length > 0) {
    console.error(`  Errors:   ${summary.errors.length}`);
    for (const err of summary.errors) {
      console.error(`    - ${err}`);
    }
  }

  db.close();
}
