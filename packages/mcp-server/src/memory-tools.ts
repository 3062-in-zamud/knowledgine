import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryProvider } from "@knowledgine/mcp-memory-protocol";
import { MemoryProtocolError } from "@knowledgine/mcp-memory-protocol";
import { formatToolResult, formatToolError } from "./helpers.js";

function handleMemoryError(error: unknown): ReturnType<typeof formatToolError> {
  if (error instanceof MemoryProtocolError) {
    return formatToolError(error.message);
  }
  return formatToolError(error instanceof Error ? error.message : String(error));
}

export function registerMemoryTools(server: McpServer, provider: MemoryProvider): void {
  // store_memory
  server.registerTool(
    "store_memory",
    {
      description:
        "Store a new memory entry. Supports episodic (short-term), semantic (mid-term), and procedural (long-term) layers.",
      inputSchema: {
        content: z.string().describe("Memory content to store (required, non-empty)"),
        layer: z
          .string()
          .optional()
          .describe("Memory layer: episodic (default), semantic, or procedural"),
        tags: z.array(z.string()).optional().describe("Classification tags"),
        metadata: z
          .object({
            source: z.string().nullable().optional(),
            project: z.string().nullable().optional(),
            sessionId: z.string().nullable().optional(),
            confidence: z.number().min(0).max(1).nullable().optional(),
          })
          .passthrough()
          .optional()
          .describe("Optional metadata"),
        ttl: z.number().int().positive().optional().describe("Time-to-live in seconds (optional)"),
      },
    },
    async (input) => {
      try {
        const result = await provider.store({
          content: input.content,
          layer: input.layer as import("@knowledgine/mcp-memory-protocol").MemoryLayer | undefined,
          tags: input.tags,
          metadata: input.metadata as Record<string, unknown> | undefined,
          ttl: input.ttl,
        });
        return formatToolResult(result);
      } catch (error) {
        return handleMemoryError(error);
      }
    },
  );

  // recall_memory
  server.registerTool(
    "recall_memory",
    {
      description:
        "Retrieve memory entries. Optionally filter by layer, tags, date range, or specific IDs. Omit query for recent entries.",
      inputSchema: {
        query: z.string().optional().describe("Full-text search query (omit for recent entries)"),
        filter: z
          .object({
            layer: z
              .enum(["episodic", "semantic", "procedural"])
              .optional()
              .describe("Filter by layer"),
            tags: z.array(z.string()).optional().describe("Filter by tags (AND)"),
            createdAfter: z.string().optional().describe("ISO 8601 lower bound for createdAt"),
            createdBefore: z.string().optional().describe("ISO 8601 upper bound for createdAt"),
            memoryIds: z.array(z.string()).optional().describe("Explicit memory IDs to retrieve"),
          })
          .optional()
          .describe("Filter conditions"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max results (default: 10, max: 100)"),
        includeVersionHistory: z
          .boolean()
          .optional()
          .describe("Include deprecated/versioned entries (default: false)"),
        asOf: z
          .string()
          .optional()
          .describe("Point-in-time query (ISO 8601). Requires temporal_query capability."),
      },
    },
    async (input) => {
      try {
        const result = await provider.recall({
          query: input.query,
          filter: input.filter,
          limit: input.limit,
          includeVersionHistory: input.includeVersionHistory,
          asOf: input.asOf,
        });
        return formatToolResult(result);
      } catch (error) {
        return handleMemoryError(error);
      }
    },
  );

  // update_memory
  server.registerTool(
    "update_memory",
    {
      description:
        "Update an existing memory entry. By default creates a new version (immutable history). Set createVersion=false for in-place update.",
      inputSchema: {
        id: z.string().min(1).describe("Memory entry ID"),
        content: z.string().optional().describe("New content"),
        summary: z.string().optional().describe("New summary"),
        tags: z.array(z.string()).optional().describe("Replace tags"),
        metadata: z
          .object({
            source: z.string().nullable().optional(),
            project: z.string().nullable().optional(),
            sessionId: z.string().nullable().optional(),
            confidence: z.number().min(0).max(1).nullable().optional(),
          })
          .passthrough()
          .partial()
          .optional()
          .describe("Metadata to merge"),
        createVersion: z.boolean().optional().describe("Create new version (default: true)"),
      },
    },
    async (input) => {
      try {
        const result = await provider.update({
          id: input.id,
          content: input.content,
          summary: input.summary,
          tags: input.tags,
          metadata: input.metadata as Record<string, unknown> | undefined,
          createVersion: input.createVersion,
        });
        return formatToolResult(result);
      } catch (error) {
        return handleMemoryError(error);
      }
    },
  );

  // forget_memory
  server.registerTool(
    "forget_memory",
    {
      description:
        "Delete a memory entry. Soft delete (default) marks as deprecated and keeps data recoverable. Hard delete physically removes it.",
      inputSchema: {
        id: z.string().min(1).describe("Memory entry ID"),
        reason: z.string().optional().describe("Deletion reason (for audit log)"),
        hard: z
          .boolean()
          .optional()
          .describe("Physical delete if true (default: false = soft delete)"),
      },
    },
    async (input) => {
      try {
        const result = await provider.forget({
          id: input.id,
          reason: input.reason,
          hard: input.hard,
        });
        return formatToolResult(result);
      } catch (error) {
        return handleMemoryError(error);
      }
    },
  );

  // get_memory_capabilities
  server.registerTool(
    "get_memory_capabilities",
    {
      description: "Get memory provider capabilities",
      inputSchema: {},
    },
    async () => {
      const caps = provider.capabilities();
      return { content: [{ type: "text" as const, text: JSON.stringify(caps, null, 2) }] };
    },
  );
}
