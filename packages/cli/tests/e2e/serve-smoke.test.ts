import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn, ChildProcess } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("E2E: serve command", { timeout: 30_000 }, () => {
  const testDir = mkdtempSync(join(tmpdir(), "knowledgine-serve-"));
  const cliPath = join(process.cwd(), "packages/cli/dist/index.js");
  let serverProcess: ChildProcess;
  const port = 13456 + Math.floor(Math.random() * 1000); // ランダムポートで競合回避

  beforeAll(async () => {
    mkdirSync(join(testDir, "notes"), { recursive: true });
    writeFileSync(join(testDir, "notes", "test.md"), "# Test\nContent");
    execFileSync("node", [cliPath, "init", "--path", testDir], { stdio: "pipe" });

    // サーバーをバックグラウンドで起動
    serverProcess = spawn("node", [cliPath, "serve", "--path", testDir, "--port", String(port)], {
      stdio: "pipe",
    });

    const stderrChunks: string[] = [];
    serverProcess.stderr?.on("data", (data) => {
      stderrChunks.push(data.toString());
    });

    // サーバー起動待ち
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Server start timeout\n${stderrChunks.join("")}`.trim()));
      }, 10_000);

      const cleanup = () => {
        clearTimeout(timeout);
        serverProcess.off("error", onError);
        serverProcess.off("exit", onExit);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        reject(
          new Error(
            `Server exited before readiness (code=${String(code)}, signal=${String(signal)})\n${stderrChunks.join("")}`.trim(),
          ),
        );
      };

      const checkHealth = async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          if (res.ok) {
            cleanup();
            resolve();
            return;
          }
        } catch {
          // Retry until the timeout fires or the process exits.
        }

        setTimeout(() => {
          void checkHealth();
        }, 200);
      };

      serverProcess.on("error", onError);
      serverProcess.on("exit", onExit);
      void checkHealth();
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
