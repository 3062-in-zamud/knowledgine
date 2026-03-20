import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KnowledgeSearcher, LocalLinkGenerator } from "@knowledgine/core";
import type { KnowledgeRepository, EmbeddingProvider } from "@knowledgine/core";
import { formatToolResult, formatToolError } from "./helpers.js";

export function createKnowledgineMcpServer(
  repository: KnowledgeRepository,
  rootPath?: string,
  embeddingProvider?: EmbeddingProvider,
): McpServer {
  const server = new McpServer({ name: "knowledgine", version: "0.0.1" });
  const searcher = new KnowledgeSearcher(repository, embeddingProvider);

  // Tool 1: search_knowledge
  server.registerTool(
    "search_knowledge",
    {
      description:
        "Full-text and semantic search across notes in the knowledge base. Use mode='keyword' for exact matches, 'semantic' for conceptual similarity, or 'hybrid' to combine both.",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().int().positive().optional().describe("Maximum number of results"),
        mode: z
          .enum(["keyword", "semantic", "hybrid"])
          .optional()
          .describe("Search mode (default: keyword)"),
      },
    },
    async (input) => {
      try {
        const results = await searcher.search({
          query: input.query,
          limit: input.limit ?? 20,
          mode: input.mode ?? "keyword",
        });
        return formatToolResult({
          query: input.query,
          mode: input.mode ?? "keyword",
          totalResults: results.length,
          results: results.map((r) => ({
            noteId: r.note.id,
            filePath: r.note.file_path,
            title: r.note.title,
            score: r.score,
            matchReason: r.matchReason,
            createdAt: r.note.created_at,
          })),
        });
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // Tool 2: find_related
  server.registerTool(
    "find_related",
    {
      description:
        "Find related notes and problem-solution pairs for a given note by ID or file path.",
      inputSchema: {
        noteId: z.number().int().positive().optional().describe("Note ID"),
        filePath: z.string().optional().describe("File path"),
        limit: z.number().int().positive().optional().describe("Maximum number of results"),
      },
    },
    async (input) => {
      try {
        let resolvedNoteId = input.noteId;

        if (!resolvedNoteId && input.filePath) {
          // Normalize absolute paths to relative (H-5)
          let normalizedPath = input.filePath;
          if (rootPath && normalizedPath.startsWith("/")) {
            const { relative, isAbsolute } = await import("path");
            if (isAbsolute(normalizedPath)) {
              normalizedPath = relative(rootPath, normalizedPath);
            }
          }
          const note = repository.getNoteByPath(normalizedPath);
          if (!note) {
            return formatToolError(`Note not found for path: ${input.filePath}`);
          }
          resolvedNoteId = note.id;
        }

        if (!resolvedNoteId) {
          return formatToolError("Either noteId or filePath is required");
        }

        const linkGenerator = new LocalLinkGenerator(repository);
        const relatedNotes = linkGenerator.findRelatedNotes(resolvedNoteId, input.limit ?? 5);
        const problemSolutionPairs = repository.getProblemSolutionPairsByNoteId(resolvedNoteId);

        return formatToolResult({
          noteId: resolvedNoteId,
          relatedNotes,
          problemSolutionPairs,
        });
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // Tool 3: get_stats
  server.registerTool(
    "get_stats",
    {
      description: "Get statistics for the knowledge base including note counts and embedding status.",
      inputSchema: {},
    },
    async () => {
      try {
        const stats = repository.getStats();
        const notesWithoutEmbeddings = embeddingProvider
          ? repository.getNotesWithoutEmbeddings().length
          : null;

        return formatToolResult({
          ...stats,
          embeddingStatus: {
            available: embeddingProvider != null,
            notesWithoutEmbeddings,
          },
        });
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  return server;
}
