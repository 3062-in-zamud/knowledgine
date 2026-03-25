import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKnowledgineMcpServer } from "../src/server.js";
import { MemoryManager, ALL_MIGRATIONS, createDatabase, Migrator } from "@knowledgine/core";
import { KnowledgeRepository } from "@knowledgine/core";

function createTestDb() {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const memoryManager = new MemoryManager(db);
  return { db, repository, memoryManager };
}

describe("Memory MCP Tools", () => {
  let client: Client;
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();

    const server = createKnowledgineMcpServer({
      repository: ctx.repository,
      db: ctx.db,
      memoryManager: ctx.memoryManager,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("registers 4 memory tools in addition to base tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("store_memory");
    expect(names).toContain("recall_memory");
    expect(names).toContain("update_memory");
    expect(names).toContain("forget_memory");
  });

  describe("store_memory", () => {
    it("stores a memory and returns id/layer/version/createdAt", async () => {
      const result = await client.callTool({
        name: "store_memory",
        arguments: { content: "TypeScript strict mode requires null checks" },
      });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(d.id).toBeTruthy();
      expect(d.layer).toBe("episodic");
      expect(d.version).toBe(1);
      expect(d.createdAt).toBeTruthy();
    });

    it("stores with semantic layer", async () => {
      const result = await client.callTool({
        name: "store_memory",
        arguments: { content: "Design pattern knowledge", layer: "semantic" },
      });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(d.layer).toBe("semantic");
    });

    it("returns INVALID_CONTENT for empty content", async () => {
      const result = await client.callTool({
        name: "store_memory",
        arguments: { content: "" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(text).toContain("INVALID_CONTENT");
    });

    it("stores with tags", async () => {
      const result = await client.callTool({
        name: "store_memory",
        arguments: { content: "Tagged memory", tags: ["typescript", "testing"] },
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe("recall_memory", () => {
    let storedId: string;

    beforeEach(async () => {
      const storeResult = await client.callTool({
        name: "store_memory",
        arguments: { content: "Test memory for recall", layer: "episodic" },
      });
      const d = JSON.parse((storeResult.content as Array<{ text: string }>)[0].text);
      storedId = d.id;
    });

    it("recalls memories with memories/totalCount/hasMore", async () => {
      const result = await client.callTool({ name: "recall_memory", arguments: {} });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(Array.isArray(d.memories)).toBe(true);
      expect(typeof d.totalCount).toBe("number");
      expect(typeof d.hasMore).toBe("boolean");
    });

    it("each memory has required fields", async () => {
      const result = await client.callTool({ name: "recall_memory", arguments: {} });
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      const m = d.memories[0] as Record<string, unknown>;
      expect(m.id).toBeTruthy();
      expect(m.content).toBeTruthy();
      expect(m.layer).toBeTruthy();
      expect(typeof m.version).toBe("number");
      expect(typeof m.accessCount).toBe("number");
      expect(Array.isArray(m.tags)).toBe(true);
      expect(m.createdAt).toBeTruthy();
    });

    it("filters by layer", async () => {
      const result = await client.callTool({
        name: "recall_memory",
        arguments: { filter: { layer: "episodic" } },
      });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      for (const m of d.memories as Array<Record<string, unknown>>) {
        expect(m.layer).toBe("episodic");
      }
    });

    it("retrieves by explicit memoryIds", async () => {
      const result = await client.callTool({
        name: "recall_memory",
        arguments: { filter: { memoryIds: [storedId] } },
      });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(d.memories).toHaveLength(1);
      expect((d.memories[0] as Record<string, unknown>).id).toBe(storedId);
    });

    it("respects limit", async () => {
      // Store extra entries
      await client.callTool({ name: "store_memory", arguments: { content: "Extra memory 1" } });
      await client.callTool({ name: "store_memory", arguments: { content: "Extra memory 2" } });
      const result = await client.callTool({
        name: "recall_memory",
        arguments: { limit: 1 },
      });
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(d.memories).toHaveLength(1);
    });
  });

  describe("update_memory", () => {
    let storedId: string;

    beforeEach(async () => {
      const r = await client.callTool({
        name: "store_memory",
        arguments: { content: "Original content" },
      });
      storedId = JSON.parse((r.content as Array<{ text: string }>)[0].text).id;
    });

    it("in-place update (createVersion: false)", async () => {
      const result = await client.callTool({
        name: "update_memory",
        arguments: { id: storedId, content: "Updated content", createVersion: false },
      });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(d.id).toBe(storedId);
      expect(typeof d.version).toBe("number");
      expect(d.updatedAt).toBeTruthy();
    });

    it("versioned update (createVersion: true) creates new id", async () => {
      const result = await client.callTool({
        name: "update_memory",
        arguments: { id: storedId, content: "Versioned update", createVersion: true },
      });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(d.id).not.toBe(storedId);
      expect(d.version).toBe(2);
      expect(d.previousVersion).toBe(1);
    });

    it("returns MEMORY_NOT_FOUND for non-existent id", async () => {
      const result = await client.callTool({
        name: "update_memory",
        arguments: { id: "99999", content: "updated" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(text).toContain("MEMORY_NOT_FOUND");
    });
  });

  describe("forget_memory", () => {
    it("soft forget succeeds and entry is hidden from recall", async () => {
      const storeR = await client.callTool({
        name: "store_memory",
        arguments: { content: "To be forgotten" },
      });
      const id = JSON.parse((storeR.content as Array<{ text: string }>)[0].text).id;

      const result = await client.callTool({
        name: "forget_memory",
        arguments: { id, reason: "test" },
      });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(d.forgotten).toBe(true);
      expect(d.method).toBe("soft");

      // Entry should be hidden from recall
      const recallR = await client.callTool({
        name: "recall_memory",
        arguments: { filter: { memoryIds: [id] } },
      });
      const rd = JSON.parse((recallR.content as Array<{ text: string }>)[0].text);
      expect(rd.memories).toHaveLength(0);
    });

    it("hard forget removes entry physically", async () => {
      const storeR = await client.callTool({
        name: "store_memory",
        arguments: { content: "Hard delete target" },
      });
      const id = JSON.parse((storeR.content as Array<{ text: string }>)[0].text).id;

      const result = await client.callTool({
        name: "forget_memory",
        arguments: { id, hard: true },
      });
      expect(result.isError).toBeFalsy();
      const d = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(d.method).toBe("hard");
    });

    it("returns MEMORY_NOT_FOUND for non-existent id", async () => {
      const result = await client.callTool({
        name: "forget_memory",
        arguments: { id: "99999" },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(text).toContain("MEMORY_NOT_FOUND");
    });
  });
});
