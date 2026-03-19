import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import type Database from "better-sqlite3";

export interface TestContext {
  db: Database.Database;
  repository: KnowledgeRepository;
}

export function createTestDb(): TestContext {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  return { db, repository };
}

export function seedTestData(repository: KnowledgeRepository): void {
  const now = new Date().toISOString();

  repository.saveNote({
    filePath: "typescript-guide.md",
    title: "TypeScript Guide",
    content: "Learn TypeScript basics and advanced patterns",
    frontmatter: { tags: ["typescript", "programming"] },
    createdAt: now,
  });

  repository.saveNote({
    filePath: "react-hooks.md",
    title: "React Hooks",
    content: "Understanding React hooks for state management",
    frontmatter: { tags: ["react", "hooks", "programming"] },
    createdAt: now,
  });

  repository.saveNote({
    filePath: "debugging-tips.md",
    title: "Debugging Tips",
    content: "Effective debugging strategies for TypeScript projects",
    frontmatter: { tags: ["debugging", "typescript"] },
    createdAt: now,
  });
}
