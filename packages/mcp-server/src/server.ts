import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KnowledgeSearcher, LocalLinkGenerator } from "@knowledgine/core";
import type { KnowledgeRepository } from "@knowledgine/core";
import { formatToolResult, formatToolError } from "./helpers.js";

export function createKnowledgineMcpServer(
  repository: KnowledgeRepository,
  rootPath?: string,
): McpServer {
  const server = new McpServer({ name: "knowledgine", version: "0.0.1" });

  // Tool 1: search_knowledge
  server.registerTool(
    "search_knowledge",
    {
      description: "ナレッジベース内のノートをキーワードで全文検索",
      inputSchema: {
        query: z.string().describe("検索クエリ"),
        limit: z.number().int().positive().optional().describe("最大結果数"),
      },
    },
    async (input) => {
      try {
        const searcher = new KnowledgeSearcher(repository);
        const results = searcher.search({ query: input.query, limit: input.limit ?? 20 });
        return formatToolResult({
          query: input.query,
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
      description: "指定ノートの関連ノート + 問題-解決ペアを検索",
      inputSchema: {
        noteId: z.number().int().positive().optional().describe("ノートID"),
        filePath: z.string().optional().describe("ファイルパス"),
        limit: z.number().int().positive().optional().describe("最大結果数"),
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
      description: "ナレッジベースの統計情報",
      inputSchema: {},
    },
    async () => {
      try {
        return formatToolResult(repository.getStats());
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  return server;
}
