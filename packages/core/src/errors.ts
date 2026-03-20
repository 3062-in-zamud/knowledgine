/** Base error class for all knowledgine errors */
export class KnowledgeError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "KnowledgeError";
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Error thrown when a note cannot be found */
export class KnowledgeNotFoundError extends KnowledgeError {
  constructor(
    identifier: string | number,
    identifierType: "path" | "id" = "path",
    context?: Record<string, unknown>,
  ) {
    const suggestion =
      identifierType === "path"
        ? "Please verify the file path is correct and the note exists in the knowledge base."
        : "Please verify the note ID is valid.";
    const message = `Note not found: ${identifierType} = "${identifier}". ${suggestion}`;
    super(message, { identifier, identifierType, ...context });
    this.name = "KnowledgeNotFoundError";
  }
}

/** Error thrown when FTS5 index operations fail */
export class FTSIndexError extends KnowledgeError {
  constructor(
    operation: "insert" | "update" | "delete" | "search" | "rebuild",
    cause?: unknown,
    context?: Record<string, unknown>,
  ) {
    const suggestions: Record<string, string> = {
      insert: "Check if the note data contains valid searchable content.",
      update: "Ensure the note exists before updating.",
      delete: "Verify the note ID is correct.",
      search: "Check your search query syntax. FTS5 supports AND, OR, NOT operators.",
      rebuild: "Check database integrity and available disk space.",
    };
    const message = `FTS index operation failed: ${operation}. ${suggestions[operation] ?? ""}`;
    super(message, { operation, cause, ...context });
    this.name = "FTSIndexError";
  }
}

/** Error thrown when input validation fails */
export class ValidationError extends KnowledgeError {
  constructor(field: string, value: unknown, reason: string, context?: Record<string, unknown>) {
    const valueType = value === null ? "null" : value === undefined ? "undefined" : typeof value;
    const valueInfo =
      valueType === "string" && typeof value === "string"
        ? ` (received string of length ${value.length})`
        : ` (received ${valueType})`;
    const message = `Validation failed for field "${field}": ${reason}${valueInfo}.`;
    super(message, { field, value, reason, valueType, ...context });
    this.name = "ValidationError";
  }
}

/** Error thrown when database operations fail */
export class DatabaseError extends KnowledgeError {
  constructor(operation: string, cause?: unknown, context?: Record<string, unknown>) {
    const causeMessage = cause instanceof Error ? `: ${cause.message}` : "";
    const message = `Database operation failed: ${operation}${causeMessage}. Check database connection, file permissions, and disk space.`;
    super(message, { operation, cause, ...context });
    this.name = "DatabaseError";
  }
}

/** Error thrown when pattern classification fails */
export class ClassificationError extends KnowledgeError {
  constructor(reason: string, cause?: unknown, context?: Record<string, unknown>) {
    const message = `Pattern classification failed: ${reason}.`;
    super(message, { cause, ...context });
    this.name = "ClassificationError";
  }
}

/** Error thrown when link generation fails */
export class LinkGenerationError extends KnowledgeError {
  constructor(noteId: number, reason: string, context?: Record<string, unknown>) {
    const message = `Link generation failed for note ${noteId}: ${reason}.`;
    super(message, { noteId, reason, ...context });
    this.name = "LinkGenerationError";
  }
}

/** Error thrown when a memory entry cannot be found */
export class MemoryNotFoundError extends KnowledgeError {
  constructor(id: number) {
    super(`Memory entry not found: id = ${id}.`, { id });
    this.name = "MemoryNotFoundError";
  }
}

/** Error thrown when memory promotion fails */
export class MemoryPromotionError extends KnowledgeError {
  constructor(id: number, currentLayer: string, accessCount?: number, requiredCount?: number) {
    const message =
      currentLayer === "procedural"
        ? `Cannot promote memory ${id}: already at the highest layer (procedural).`
        : `Cannot promote memory ${id}: access_count ${accessCount} is below the required threshold ${requiredCount} for promotion from ${currentLayer}.`;
    super(message, { id, currentLayer, accessCount, requiredCount });
    this.name = "MemoryPromotionError";
  }
}

/** Error thrown when memory demotion fails */
export class MemoryDemotionError extends KnowledgeError {
  constructor(id: number, currentLayer: string) {
    super(`Cannot demote memory ${id}: already at the lowest layer (${currentLayer}).`, {
      id,
      currentLayer,
    });
    this.name = "MemoryDemotionError";
  }
}

/** Error thrown when embedding model is not available */
export class EmbeddingNotAvailableError extends KnowledgeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "EmbeddingNotAvailableError";
  }
}

/** Error thrown when the sqlite-vec extension is unavailable */
export class VectorExtensionError extends KnowledgeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "VectorExtensionError";
  }
}

/** Error thrown when an embedding operation fails */
export class EmbeddingError extends KnowledgeError {
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, { cause, ...context });
    this.name = "EmbeddingError";
  }
}
