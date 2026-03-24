import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawn, ChildProcess } from "child_process";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

describe("E2E: serve command", { timeout: 30_000 }, () => {
  const testDir = join(tmpdir(), `knowledgine-serve-${randomUUID()}`);
  const cliPath = join(process.cwd(), "packages/cli/dist/index.js");
  let serverProcess: ChildProcess;
  const port = 13456 + Math.floor(Math.random() * 1000); // ランダムポートで競合回避

  beforeAll(async () => {
    mkdirSync(join(testDir, "notes"), { recursive: true });
    writeFileSync(join(testDir, "notes", "test.md"), "# Test\nContent");
    execSync(`node ${cliPath} init --path ${testDir}`, { stdio: "pipe" });

    // サーバーをバックグラウンドで起動
    serverProcess = spawn("node", [cliPath, "serve", "--path", testDir, "--port", String(port)], {
      stdio: "pipe",
    });

    // サーバー起動待ち
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10_000);
      serverProcess.stderr?.on("data", (data) => {
        if (data.toString().includes("REST API server running")) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  });

  afterAll(() => {
    serverProcess?.kill("SIGTERM");
    rmSync(testDir, { recursive: true, force: true });
  });

  it("GET /health returns ok", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("GET /stats returns stats", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalNotes).toBeGreaterThanOrEqual(0);
  });

  it("GET /search?q=test returns results", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/search?q=test`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("results");
  });
});
