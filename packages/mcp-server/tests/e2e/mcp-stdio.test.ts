import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execFileSync } from "child_process";
import type { ChildProcess } from "child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class JsonRpcTransport {
  private buffer = "";
  private pending = new Map<
    number,
    { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void }
  >();

  constructor(private proc: ChildProcess) {
    proc.stdout!.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcResponse;
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            this.pending.get(msg.id)!.resolve(msg);
            this.pending.delete(msg.id);
          }
        } catch {
          // non-JSON line, ignore
        }
      }
    });
  }

  send(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    this.proc.stdin!.write(JSON.stringify(msg) + "\n");
    if (msg.id === undefined) return Promise.resolve(null); // notification
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(msg.id!);
        reject(new Error(`Timeout: request ${msg.id}`));
      }, 10_000);
      this.pending.set(msg.id, {
        resolve: (r) => {
          clearTimeout(timeout);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
    });
  }
}

describe("MCP Server E2E: stdio", () => {
  let testDir: string;
  let serverProcess: ChildProcess;
  let transport: JsonRpcTransport;
  const monorepoRoot = resolve(__dirname, "../../../../");
  const mcpServerDist = resolve(__dirname, "../../dist/index.js");
  const cliDist = resolve(monorepoRoot, "packages/cli/dist/index.js");
  let nextId = 1;

  beforeAll(async () => {
    // Build if needed
    if (!existsSync(mcpServerDist) || !existsSync(cliDist)) {
      execFileSync("pnpm", ["run", "build"], { cwd: monorepoRoot, stdio: "inherit" });
    }

    // Create test data
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-mcp-e2e-"));

    writeFileSync(
      join(testDir, "typescript-notes.md"),
      `---
tags:
  - typescript
  - programming
---
# TypeScript Notes

TypeScriptの型システムは強力で柔軟。
ジェネリクスを使ったパターンが便利。
`,
    );

    writeFileSync(
      join(testDir, "react-notes.md"),
      `---
tags:
  - react
  - frontend
---
# React Notes

Reactのフックは関数コンポーネントを強化する。
useEffectの依存配列に注意が必要。
`,
    );

    // Run CLI init to create DB
    execFileSync("node", [cliDist, "init", "--path", testDir, "--skip-embeddings"], {
      timeout: 30_000,
    });

    const dbPath = join(testDir, ".knowledgine", "index.sqlite");

    // Spawn MCP server
    serverProcess = spawn("node", [mcpServerDist], {
      env: {
        ...process.env,
        KNOWLEDGINE_DB_PATH: dbPath,
        KNOWLEDGINE_ROOT_PATH: testDir,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for server to be ready (first stderr output or timeout)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 5_000);
      serverProcess.stderr!.once("data", () => {
        clearTimeout(timeout);
        resolve();
      });
      serverProcess.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    transport = new JsonRpcTransport(serverProcess);

    // MCP initialize handshake
    const initResponse = await transport.send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "0.0.1" },
      },
    });
    expect(initResponse).toBeTruthy();

    // Send initialized notification
    await transport.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
  }, 60_000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          serverProcess.kill("SIGKILL");
          resolve();
        }, 3_000);
        serverProcess.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should list 7 tools", async () => {
    const response = await transport.send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/list",
    });
    expect(response).toBeTruthy();
    const result = response!.result as { tools: Array<{ name: string }> };
    expect(result.tools).toHaveLength(7);
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("search_knowledge");
    expect(names).toContain("find_related");
    expect(names).toContain("get_stats");
    expect(names).toContain("search_entities");
    expect(names).toContain("get_entity_graph");
    expect(names).toContain("report_extraction_error");
    expect(names).toContain("capture_knowledge");
  });

  it("should search knowledge via search_knowledge tool", async () => {
    const response = await transport.send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: {
        name: "search_knowledge",
        arguments: { query: "TypeScript" },
      },
    });
    expect(response).toBeTruthy();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { content: Array<{ type: string; text: string }> };
    const data = JSON.parse(result.content[0].text);
    expect(data.totalResults).toBeGreaterThanOrEqual(1);
    expect(data.results[0]).toHaveProperty("noteId");
    expect(data.results[0]).toHaveProperty("filePath");
    expect(data.results[0]).toHaveProperty("title");
    expect(data.results[0]).toHaveProperty("score");
    expect(data.results[0]).toHaveProperty("matchReason");
    expect(data.results[0]).toHaveProperty("createdAt");
  });

  it("should find related notes via find_related tool", async () => {
    const response = await transport.send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: {
        name: "find_related",
        arguments: { noteId: 1 },
      },
    });
    expect(response).toBeTruthy();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { content: Array<{ type: string; text: string }> };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("noteId");
    expect(data).toHaveProperty("relatedNotes");
    expect(data).toHaveProperty("problemSolutionPairs");
  });

  it("should return stats via get_stats tool", async () => {
    const response = await transport.send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: {
        name: "get_stats",
        arguments: {},
      },
    });
    expect(response).toBeTruthy();
    expect(response!.error).toBeUndefined();
    const result = response!.result as { content: Array<{ type: string; text: string }> };
    const data = JSON.parse(result.content[0].text);
    expect(data.totalNotes).toBeGreaterThanOrEqual(1);
    expect(data).toHaveProperty("totalPatterns");
    expect(data).toHaveProperty("totalLinks");
    expect(data).toHaveProperty("totalPairs");
    expect(data).toHaveProperty("patternsByType");
  });
});
