/**
 * Shorten file path to last N segments to save embedding tokens.
 */
function shortenPath(filePath: string, maxSegments = 3): string {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= maxSegments) return normalized;
  return segments.slice(-maxSegments).join("/");
}

/**
 * Build embedding input text with file path context prefix.
 * This disperses embedding vectors for same-name files in monorepos.
 */
export function buildEmbeddingInput(note: {
  file_path?: string;
  filePath?: string;
  title: string;
  content: string;
}): string {
  const path = note.file_path ?? note.filePath ?? "";
  if (!path) return `${note.title}\n${note.content}`;
  return `[${shortenPath(path)}] ${note.title}\n${note.content}`;
}
