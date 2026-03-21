import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { KnowledgeService, VERSION } from "@knowledgine/core";
import type { KnowledgeRepository, EmbeddingProvider, FeedbackErrorType } from "@knowledgine/core";
import type { GraphRepository, FeedbackRepository } from "@knowledgine/core";
import type Database from "better-sqlite3";
import { formatToolResult, formatToolError } from "./helpers.js";

export interface McpServerOptions {
  repository: KnowledgeRepository;
  rootPath?: string;
  embeddingProvider?: EmbeddingProvider;
  graphRepository?: GraphRepository;
  feedbackRepository?: FeedbackRepository;
  db?: Database.Database;
}

export function createKnowledgineMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer({ name: "knowledgine", version: VERSION });
  const service = new KnowledgeService(options);

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
        const result = await service.search({
          query: input.query,
          limit: input.limit ?? 20,
          mode: input.mode ?? "keyword",
        });
        return formatToolResult(result);
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
        const result = await service.findRelated({
          noteId: input.noteId,
          filePath: input.filePath,
          limit: input.limit ?? 5,
          maxHops: input.maxHops ?? 1,
        });
        return formatToolResult(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // findRelated throws Error for user-facing errors
        return formatToolError(msg);
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
        const result = service.getStats();
        return formatToolResult(result);
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
        if (!options.graphRepository) {
          return formatToolError("Knowledge graph is not available");
        }
        const result = service.searchEntities({ query: input.query, limit: input.limit ?? 20 });
        return formatToolResult(result);
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
        if (!options.graphRepository) {
          return formatToolError("Knowledge graph is not available");
        }
        if (!input.entityId && !input.entityName) {
          return formatToolError("Either entityId or entityName is required");
        }
        const graph = service.getEntityGraph({
          entityId: input.entityId,
          entityName: input.entityName,
        });
        if (!graph) {
          if (input.entityName) {
            return formatToolError(`Entity not found: ${input.entityName}`);
          }
          return formatToolError(`Entity not found: id=${input.entityId}`);
        }
        return formatToolResult(graph);
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // Tool 6: report_extraction_error
  server.registerTool(
    "report_extraction_error",
    {
      description:
        "Report an extraction error for feedback. Helps improve entity extraction accuracy.",
      inputSchema: {
        entityName: z.string().describe("Name of the entity with the error"),
        errorType: z
          .enum(["false_positive", "wrong_type", "missed_entity"])
          .describe("Type of error"),
        entityType: z.string().optional().describe("Current entity type"),
        correctType: z.string().optional().describe("Correct type (for wrong_type errors)"),
        noteId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Note ID where the error was found"),
        details: z.string().optional().describe("Additional details"),
      },
    },
    async (input) => {
      try {
        const result = service.reportExtractionError({
          entityName: input.entityName,
          errorType: input.errorType as FeedbackErrorType,
          entityType: input.entityType,
          correctType: input.correctType,
          noteId: input.noteId,
          details: input.details,
        });
        return formatToolResult(result);
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  // Tool 7: capture_knowledge
  server.registerTool(
    "capture_knowledge",
    {
      description:
        "Capture and store knowledge. Use after solving problems, making decisions, or discovering patterns.",
      inputSchema: {
        content: z.string().describe("Knowledge content to capture"),
        title: z.string().optional().describe("Optional title"),
        tags: z.array(z.string()).optional().describe("Optional tags"),
        source: z.string().optional().describe("Optional source description"),
      },
    },
    async (input) => {
      try {
        if (!options.db) {
          return formatToolError("Database not available for capture");
        }
        const { EventWriter, sanitizeContent } = await import("@knowledgine/ingest");
        const writer = new EventWriter(options.db, options.repository);
        const title = input.title || input.content.slice(0, 50).replace(/\n/g, " ").trim();
        const sourceUri = input.source ? `capture://${input.source}` : "capture://mcp";
        const event = {
          sourceUri,
          eventType: "capture" as const,
          title,
          content: sanitizeContent(input.content),
          timestamp: new Date(),
          metadata: {
            sourcePlugin: "capture",
            sourceId: `capture-${Date.now()}`,
            tags: input.tags,
          },
        };
        const result = writer.writeEvent(event);
        return formatToolResult({
          id: result.id,
          title,
          tags: input.tags ?? [],
          sourceUri,
        });
      } catch (error) {
        return formatToolError(error instanceof Error ? error.message : String(error));
      }
    },
  );

  return server;
}
