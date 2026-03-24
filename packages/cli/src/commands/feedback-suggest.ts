import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import type { Command } from "commander";

export interface FeedbackSuggestOptions {
  useful?: boolean;
  notUseful?: boolean;
  path?: string;
}

async function feedbackSuggestAction(
  noteIdStr: string,
  options: FeedbackSuggestOptions,
): Promise<void> {
  const noteId = parseInt(noteIdStr, 10);
  if (isNaN(noteId) || noteId <= 0) {
    console.error(`Error: Invalid note ID "${noteIdStr}". Must be a positive integer.`);
    process.exitCode = 1;
    return;
  }

  if (!options.useful && !options.notUseful) {
    console.error("Error: Specify either --useful or --not-useful to record feedback.");
    process.exitCode = 1;
    return;
  }

  const isUseful = Boolean(options.useful);

  const rootPath = resolveDefaultPath(options.path);
  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);

  try {
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    const note = repository.getNoteById(noteId);
    if (!note) {
      console.error(`Error: Note not found (ID: ${noteId}).`);
      process.exitCode = 1;
      return;
    }

    repository.saveSuggestFeedback(noteId, "", isUseful);
    console.log(`Feedback saved for note ${noteId} ("${note.title}").`);
  } finally {
    db.close();
  }
}

export function registerFeedbackSuggestCommand(program: Command): void {
  program
    .command("feedback-suggest <note-id>")
    .description("Provide feedback on a suggest result")
    .option("--useful", "Mark this suggestion as useful")
    .option("--not-useful", "Mark this suggestion as not useful")
    .option("--path <dir>", "Project root path")
    .action(feedbackSuggestAction);
}
