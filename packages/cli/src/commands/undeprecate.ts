import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";

export interface UndeprecateCommandOptions {
  path?: string;
}

export async function undeprecateCommand(
  noteId: string,
  options: UndeprecateCommandOptions,
): Promise<void> {
  const id = parseInt(noteId, 10);
  if (isNaN(id) || id <= 0) {
    console.error(`Error: Invalid note ID "${noteId}". Must be a positive integer.`);
    process.exit(1);
  }

  const rootPath = resolveDefaultPath(options.path);
  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);

  try {
    const note = repository.getNoteById(id);
    if (!note) {
      console.error(`Error: Note with ID ${id} not found.`);
      db.close();
      process.exit(1);
    }

    db.prepare(
      "UPDATE knowledge_notes SET deprecated = 0, deprecation_reason = NULL WHERE id = ?",
    ).run(id);

    console.log(`Note ${id} ("${note.title}") has been un-deprecated.`);
  } finally {
    db.close();
  }
}
