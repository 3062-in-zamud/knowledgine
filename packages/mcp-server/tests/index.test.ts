import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKnowledgineMcpServer } from "../src/server.js";
import { createTestDb, seedTestData } from "./helpers/test-db.js";
import type { TestContext } from "./helpers/test-db.js";

describe("MCP Server Integration", () => {
  let ctx: TestContext;
  let client: Client;

  beforeEach(async () => {
    ctx = createTestDb();
    seedTestData(ctx.repository);

    const server = createKnowledgineMcpServer(ctx.repository);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "0.0.1" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("should list 3 tools", async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain("search_knowledge");
    expect(toolNames).toContain("find_related");
    expect(toolNames).toContain("get_stats");
    expect(toolNames).toHaveLength(3);
  });

  describe("search_knowledge", () => {
    it("should return search results for a valid query", async () => {
      const result = await client.callTool({
        name: "search_knowledge",
        arguments: { query: "TypeScript" },
      });
      expect(result.isError).toBeFalsy();

      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      expect(data.query).toBe("TypeScript");
      expect(data.totalResults).toBeGreaterThanOrEqual(1);
      expect(data.results[0]).toHaveProperty("noteId");
      expect(data.results[0]).toHaveProperty("filePath");
      expect(data.results[0]).toHaveProperty("title");
      expect(data.results[0]).toHaveProperty("score");
      expect(data.results[0]).toHaveProperty("matchReason");
      expect(data.results[0]).toHaveProperty("createdAt");
    });

    it("should return empty results for non-matching query", async () => {
      const result = await client.callTool({
        name: "search_knowledge",
        arguments: { query: "nonexistent_zzz_query" },
      });
      expect(result.isError).toBeFalsy();

      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      expect(data.totalResults).toBe(0);
    });
  });

  describe("find_related", () => {
    it("should return related notes by noteId", async () => {
      const result = await client.callTool({ name: "find_related", arguments: { noteId: 1 } });
      expect(result.isError).toBeFalsy();

      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      expect(data.noteId).toBe(1);
      expect(data).toHaveProperty("relatedNotes");
      expect(data).toHaveProperty("problemSolutionPairs");
    });

    it("should return error when neither noteId nor filePath is provided", async () => {
      const result = await client.callTool({ name: "find_related", arguments: {} });
      expect(result.isError).toBe(true);

      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("Either noteId or filePath is required");
    });

    it("should return error for non-existent filePath", async () => {
      const result = await client.callTool({
        name: "find_related",
        arguments: { filePath: "nonexistent.md" },
      });
      expect(result.isError).toBe(true);

      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("Note not found for path");
    });

    it("should resolve by filePath", async () => {
      const result = await client.callTool({
        name: "find_related",
        arguments: { filePath: "typescript-guide.md" },
      });
      expect(result.isError).toBeFalsy();

      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      expect(data.noteId).toBe(1);
    });
  });

  describe("get_stats", () => {
    it("should return statistics", async () => {
      const result = await client.callTool({ name: "get_stats", arguments: {} });
      expect(result.isError).toBeFalsy();

      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      expect(data.totalNotes).toBe(3);
      expect(data).toHaveProperty("totalPatterns");
      expect(data).toHaveProperty("totalLinks");
      expect(data).toHaveProperty("totalPairs");
      expect(data).toHaveProperty("patternsByType");
    });
  });
});
