import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KnowledgeSearcher, LocalLinkGenerator } from "@knowledgine/core";
import type { KnowledgeRepository, EmbeddingProvider } from "@knowledgine/core";
import type { GraphRepository } from "@knowledgine/core";
import { formatToolResult, formatToolError } from "./helpers.js";

export function createKnowledgineMcpServer(
  repository: KnowledgeRepository,
  rootPath?: string,
  embeddingProvider?: EmbeddingProvider,
  graphRepository?: GraphRepository,
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
        "Find related notes and problem-solution pairs for a given note by ID or file path. Optionally traverses the knowledge graph.",
      inputSchema: {
        noteId: z.number().int().positive().optional().describe("Note ID"),
        filePath: z.string().optional().describe("File path"),
        limit: z.number().int().positive().optional().describe("Maximum number of results"),
        maxHops: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe("Graph traversal hops (default: 1, max: 3)"),
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

        const linkGenerator = new LocalLinkGenerator(repository, graphRepository);
        const relatedNotes = linkGenerator.findRelatedNotes(resolvedNoteId, input.limit ?? 5);
        const problemSolutionPairs = repository.getProblemSolutionPairsByNoteId(resolvedNoteId);

        // Graph relations if available
        let graphRelations: unknown[] = [];
        if (graphRepository) {
          const linkedEntities = graphRepository.getLinkedEntities(resolvedNoteId);
          const maxHops = input.maxHops ?? 1;
          graphRelations = linkedEntities.map((entity) => ({
            entityId: entity.id,
            name: entity.name,
            entityType: entity.entityType,
            relatedEntities: graphRepository.findRelatedEntities(entity.id!, maxHops).map((e) => ({
              id: e.id,
              name: e.name,
              entityType: e.entityType,
              hops: e.hops,
            })),
          }));
        }

        return formatToolResult({
          noteId: resolvedNoteId,
          relatedNotes,
          problemSolutionPairs,
          graphRelations,
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
      description:
        "Get statistics for the knowledge base including note counts, embedding status, and knowledge graph stats.",
      inputSchema: {},
    },
    async () => {
      try {
        const stats = repository.getStats();
        const notesWithoutEmbeddings = embeddingProvider
          ? repository.getNotesWithoutEmbeddings().length
          : null;
        const graphStats = graphRepository ? graphRepository.getGraphStats() : null;

        return formatToolResult({
          ...stats,
          embeddingStatus: {
            available: embeddingProvider != null,
            notesWithoutEmbeddings,
          },
          graphStats,
        });
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // Tool 4: search_entities
  server.registerTool(
    "search_entities",
    {
      description:
        "Search for entities (people, technologies, projects, concepts) in the knowledge graph.",
      inputSchema: {
        query: z.string().describe("Entity name or description to search for"),
        limit: z.number().int().positive().optional().describe("Maximum number of results"),
      },
    },
    async (input) => {
      try {
        if (!graphRepository) {
          return formatToolError("Knowledge graph is not available");
        }
        const entities = graphRepository.searchEntities(input.query, input.limit ?? 20);
        return formatToolResult({
          query: input.query,
          totalResults: entities.length,
          entities: entities.map((e) => ({
            id: e.id,
            name: e.name,
            entityType: e.entityType,
            description: e.description,
            createdAt: e.createdAt,
          })),
        });
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // Tool 5: get_entity_graph
  server.registerTool(
    "get_entity_graph",
    {
      description:
        "Get full graph data for a specific entity including observations, relations, and linked notes.",
      inputSchema: {
        entityId: z.number().int().positive().optional().describe("Entity ID"),
        entityName: z.string().optional().describe("Entity name (case-insensitive)"),
      },
    },
    async (input) => {
      try {
        if (!graphRepository) {
          return formatToolError("Knowledge graph is not available");
        }
        let entityId = input.entityId;
        if (!entityId && input.entityName) {
          const entity = graphRepository.getEntityByName(input.entityName);
          if (!entity) {
            return formatToolError(`Entity not found: ${input.entityName}`);
          }
          entityId = entity.id;
        }
        if (!entityId) {
          return formatToolError("Either entityId or entityName is required");
        }
        const graph = graphRepository.getEntityWithGraph(entityId);
        if (!graph) {
          return formatToolError(`Entity not found: id=${entityId}`);
        }
        return formatToolResult(graph);
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  return server;
}
