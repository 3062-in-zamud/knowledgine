import { bench, describe } from "vitest";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  KnowledgeSearcher,
  ALL_MIGRATIONS,
} from "../../src/index.js";

function seedNotes(repository: KnowledgeRepository, count: number): void {
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    repository.saveNote({
      filePath: `note-${i}.md`,
      title: `Note ${i} about ${["TypeScript", "React", "Node.js", "Testing", "Performance"][i % 5]}`,
      content: `Content for note ${i}. ${["TypeScript is great for type safety", "React hooks simplify state management", "Node.js enables server-side JavaScript", "Testing ensures code quality", "Performance optimization matters"][i % 5]}. Additional text for search indexing with keywords.`,
      frontmatter: { tags: [["typescript", "react", "nodejs", "testing", "performance"][i % 5]] },
      createdAt: now,
    });
  }
}

describe("Search latency benchmarks", () => {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const searcher = new KnowledgeSearcher(repository);

  seedNotes(repository, 1000);

  bench("FTS keyword search (1000 notes)", async () => {
    await searcher.search({ query: "TypeScript", mode: "keyword", limit: 50 });
  });

  bench("Tag similarity search (1000 notes)", () => {
    repository.findNotesByTagSimilarity(1, ["typescript"], 50);
  });

  bench("getNoteById (single lookup)", () => {
    repository.getNoteById(1);
  });

  bench("getNotesSummaryByIds (batch 20)", () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    repository.getNotesSummaryByIds(ids);
  });
});
