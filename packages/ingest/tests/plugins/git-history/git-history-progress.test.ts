import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitHistoryPlugin } from "../../../src/plugins/git-history/index.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", "user.email=test@test.com", "-c", "user.name=Test", ...args],
    { cwd },
  );
  return stdout.trim();
}

describe("GitHistoryPlugin progress display", () => {
  let plugin: GitHistoryPlugin;
  let repoDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    plugin = new GitHistoryPlugin();
    repoDir = await mkdtemp(join(tmpdir(), "knowledgine-progress-test-"));
    await git(["init"], repoDir);
    await git(["checkout", "-b", "main"], repoDir);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    stderrSpy.mockRestore();
    await rm(repoDir, { recursive: true, force: true });
  });

  it("should output progress messages during ingestAll", async () => {
    // Create 3 commits
    for (let i = 1; i <= 3; i++) {
      await writeFile(join(repoDir, `file${i}.txt`), `content ${i}`);
      await git(["add", "."], repoDir);
      await git(["commit", "-m", `Commit ${i}`], repoDir);
    }

    await plugin.initialize({ limit: 3 });

    const events = [];
    for await (const event of plugin.ingestAll(repoDir)) {
      events.push(event);
    }

    expect(events).toHaveLength(3);

    const stderrCalls = stderrSpy.mock.calls.map(([msg]) => msg as string);
    const progressMsg = stderrCalls.find(
      (msg) => msg.includes("Processing commit") && msg.includes("3/3"),
    );
    expect(progressMsg).toBeDefined();
  }, 15_000);
});
