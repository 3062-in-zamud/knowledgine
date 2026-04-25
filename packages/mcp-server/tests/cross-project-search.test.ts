import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import type { ProjectEntry } from "@knowledgine/core";
import { createKnowledgineMcpServer } from "../src/server.js";
import { createTestDb, seedTestData } from "./helpers/test-db.js";
import type { TestContext } from "./helpers/test-db.js";

function createProjectDir(seed: { title: string; content: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "knowledgine-mcp-cp-"));
  const dbPath = join(dir, ".knowledgine", "index.sqlite");
  const db = createDatabase(dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repo = new KnowledgeRepository(db);
  repo.saveNote({
    filePath: `${seed.title.toLowerCase().replace(/\s+/g, "-")}.md`,
    title: seed.title,
    content: seed.content,
    createdAt: new Date().toISOString(),
  });
  db.close();
  return dir;
}

describe("MCP search_knowledge — cross-project branch", () => {
  let ctx: TestContext;
  let client: Client;
  let projectDirs: string[];
  let projects: ProjectEntry[];

  beforeEach(async () => {
    projectDirs = [];
    ctx = createTestDb();
    seedTestData(ctx.repository);

    const dirA = createProjectDir({
      title: "Alpha Note",
      content: "Cross-project keyword: distributed-tracing in alpha",
    });
    const dirB = createProjectDir({
      title: "Beta Note",
      content: "Cross-project keyword: distributed-tracing in beta",
    });
    projectDirs.push(dirA, dirB);
    projects = [
      { name: "alpha", path: dirA },
      { name: "beta", path: dirB },
    ];

    const server = createKnowledgineMcpServer({
      repository: ctx.repository,
      projects,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-cp-client", version: "0.0.1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    ctx.db.close();
    for (const d of projectDirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("returns crossProject:true and merges results from listed projects", async () => {
    const result = await client.callTool({
      name: "search_knowledge",
      arguments: { query: "distributed-tracing", projects: ["alpha", "beta"] },
    });
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.crossProject).toBe(true);
    expect(data.query).toBe("distributed-tracing");
    expect(Array.isArray(data.results)).toBe(true);
    const projectNames = new Set(
      (data.results as Array<{ projectName: string }>).map((r) => r.projectName),
    );
    expect(projectNames.has("alpha")).toBe(true);
    expect(projectNames.has("beta")).toBe(true);
  });

  it("filters to only the projects named in the request", async () => {
    const result = await client.callTool({
      name: "search_knowledge",
      arguments: { query: "distributed-tracing", projects: ["alpha"] },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.crossProject).toBe(true);
    const projectNames = new Set(
      (data.results as Array<{ projectName: string }>).map((r) => r.projectName),
    );
    expect(projectNames.has("alpha")).toBe(true);
    expect(projectNames.has("beta")).toBe(false);
  });

  it("falls back to local search when no projects argument is provided", async () => {
    const result = await client.callTool({
      name: "search_knowledge",
      arguments: { query: "TypeScript" },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.crossProject).toBeUndefined();
    expect(data.totalResults).toBeGreaterThanOrEqual(1);
  });

  it("returns no cross-project results when an unregistered project is requested", async () => {
    const result = await client.callTool({
      name: "search_knowledge",
      arguments: { query: "distributed-tracing", projects: ["does-not-exist"] },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.crossProject).toBe(true);
    expect(data.results).toEqual([]);
  });
});
