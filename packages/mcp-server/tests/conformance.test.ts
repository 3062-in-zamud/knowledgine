import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKnowledgineMcpServer } from "../src/server.js";
import {
  MemoryManager,
  ALL_MIGRATIONS,
  createDatabase,
  Migrator,
  KnowledgeRepository,
} from "@knowledgine/core";
import { runConformanceSuite } from "@knowledgine/mcp-memory-protocol";

function createTestDb() {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const memoryManager = new MemoryManager(db);
  return { db, repository, memoryManager };
}

describe("MCP Memory Protocol Conformance", () => {
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
    client = new Client({ name: "conformance-test-client", version: "0.0.1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("passes all base conformance tests (store/recall/update/forget)", async () => {
    const results = await runConformanceSuite({ client }, { includeVersioning: false });

    const failures = results.filter((r) => !r.passed);
    if (failures.length > 0) {
      const msg = failures.map((f) => `  - ${f.name}: ${f.error ?? "failed"}`).join("\n");
      throw new Error(`Conformance failures:\n${msg}`);
    }

    expect(results.length).toBeGreaterThan(0);
    expect(failures).toHaveLength(0);
  });

  it("passes versioning conformance tests", async () => {
    const results = await runConformanceSuite({ client }, { includeVersioning: true });

    const versioningResults = results.filter((r) => r.name.startsWith("versioning:"));
    const failures = versioningResults.filter((r) => !r.passed);

    if (failures.length > 0) {
      const msg = failures.map((f) => `  - ${f.name}: ${f.error ?? "failed"}`).join("\n");
      throw new Error(`Versioning conformance failures:\n${msg}`);
    }

    expect(versioningResults.length).toBeGreaterThan(0);
  });
});
