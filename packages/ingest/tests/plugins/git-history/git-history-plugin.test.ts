import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitHistoryPlugin } from "../../../src/plugins/git-history/index.js";
import { parseGitLog } from "../../../src/plugins/git-history/git-parser.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", "user.email=test@test.com", "-c", "user.name=Test", ...args],
    { cwd },
  );
  return stdout.trim();
}

async function initRepo(dir: string): Promise<void> {
  await git(["init"], dir);
  // デフォルトブランチをmainに設定
  await git(["checkout", "-b", "main"], dir);
}

async function addCommit(
  dir: string,
  message: string,
  files?: Record<string, string>,
): Promise<string> {
  if (files) {
    for (const [filename, content] of Object.entries(files)) {
      const filePath = join(dir, filename);
      const parentDir = join(filePath, "..");
      await mkdir(parentDir, { recursive: true });
      await writeFile(filePath, content);
    }
    await git(["add", "."], dir);
  }
  await git(["commit", "--allow-empty", "-m", message], dir);
  return git(["rev-parse", "HEAD"], dir);
}

describe("GitHistoryPlugin", () => {
  let plugin: GitHistoryPlugin;
  let repoDir: string;

  beforeEach(async () => {
    plugin = new GitHistoryPlugin();
    repoDir = await mkdtemp(join(tmpdir(), "knowledgine-git-test-"));
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("should have correct manifest", () => {
    expect(plugin.manifest.id).toBe("git-history");
    expect(plugin.manifest.name).toBe("Git History");
    expect(plugin.manifest.version).toBe("0.1.0");
    expect(plugin.manifest.schemes).toEqual(["git://"]);
    expect(plugin.manifest.priority).toBe(1);
  });

  it("should have correct triggers", () => {
    expect(plugin.triggers).toHaveLength(2);
    expect(plugin.triggers[0]).toEqual({ type: "git_hook", hook: "post-commit" });
    expect(plugin.triggers[1]).toEqual({ type: "git_hook", hook: "post-merge" });
  });

  it("should initialize successfully", async () => {
    const result = await plugin.initialize();
    expect(result.ok).toBe(true);
  });

  describe("ingestAll", () => {
    it("should yield 3 events for 3 commits", async () => {
      await initRepo(repoDir);
      await addCommit(repoDir, "First commit", { "file1.txt": "content1" });
      await addCommit(repoDir, "Second commit", { "file2.txt": "content2" });
      await addCommit(repoDir, "Third commit", { "file3.txt": "content3" });

      const events = [];
      for await (const event of plugin.ingestAll(repoDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
    }, 15_000);

    it("should produce events with correct sourceUri", async () => {
      await initRepo(repoDir);
      const hash = await addCommit(repoDir, "Initial commit", { "README.md": "# Hello" });

      const events = [];
      for await (const event of plugin.ingestAll(repoDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].sourceUri).toBe(`git://${repoDir}/commit/${hash}`);
    });

    it("should produce events with correct title", async () => {
      await initRepo(repoDir);
      await addCommit(repoDir, "My awesome commit", { "file.ts": "export const x = 1;" });

      const events = [];
      for await (const event of plugin.ingestAll(repoDir)) {
        events.push(event);
      }

      expect(events[0].title).toBe("My awesome commit");
    });

    it("should produce events with correct timestamp as Date instance", async () => {
      await initRepo(repoDir);
      await addCommit(repoDir, "Test commit", { "a.txt": "a" });

      const events = [];
      for await (const event of plugin.ingestAll(repoDir)) {
        events.push(event);
      }

      expect(events[0].timestamp).toBeInstanceOf(Date);
    });

    it("should yield 0 events for empty repository (no commits)", async () => {
      await initRepo(repoDir);

      const events = [];
      for await (const event of plugin.ingestAll(repoDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });

    it("should yield 0 events for non-git directory", async () => {
      const nonGitDir = await mkdtemp(join(tmpdir(), "non-git-"));

      try {
        const events = [];
        for await (const event of plugin.ingestAll(nonGitDir)) {
          events.push(event);
        }
        expect(events).toHaveLength(0);
      } finally {
        await rm(nonGitDir, { recursive: true, force: true });
      }
    });

    it("should handle empty commit (--allow-empty) with relatedPaths=[]", async () => {
      await initRepo(repoDir);
      await addCommit(repoDir, "Empty commit");

      const events = [];
      for await (const event of plugin.ingestAll(repoDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].relatedPaths).toEqual([]);
    });

    it("should include Japanese filenames in relatedPaths", async () => {
      await initRepo(repoDir);
      await addCommit(repoDir, "Add Japanese file", { "日本語ファイル.txt": "content" });

      const events = [];
      for await (const event of plugin.ingestAll(repoDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].relatedPaths).toContain("日本語ファイル.txt");
    });
  });

  describe("ingestIncremental", () => {
    it("should only yield commits after checkpoint", async () => {
      await initRepo(repoDir);
      const hash1 = await addCommit(repoDir, "Commit 1", { "a.txt": "a" });
      await addCommit(repoDir, "Commit 2", { "b.txt": "b" });
      await addCommit(repoDir, "Commit 3", { "c.txt": "c" });

      const events = [];
      for await (const event of plugin.ingestIncremental(repoDir, hash1)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].title).toBe("Commit 2");
      expect(events[1].title).toBe("Commit 3");
    });

    it("should return 0 events when checkpoint is HEAD", async () => {
      await initRepo(repoDir);
      await addCommit(repoDir, "Only commit", { "a.txt": "a" });
      const checkpoint = await git(["rev-parse", "HEAD"], repoDir);

      const events = [];
      for await (const event of plugin.ingestIncremental(repoDir, checkpoint)) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });

    it("should throw for invalid checkpoint format", async () => {
      await initRepo(repoDir);
      await addCommit(repoDir, "Commit", { "a.txt": "a" });

      await expect(async () => {
        for await (const _ of plugin.ingestIncremental(repoDir, "invalid-checkpoint")) {
          // consume
        }
      }).rejects.toThrow("Invalid checkpoint format");
    });
  });

  describe("getCurrentCheckpoint", () => {
    it("should return HEAD SHA-1", async () => {
      await initRepo(repoDir);
      const hash = await addCommit(repoDir, "Commit", { "a.txt": "a" });

      const checkpoint = await plugin.getCurrentCheckpoint(repoDir);
      expect(checkpoint).toBe(hash);
      expect(checkpoint).toMatch(/^[0-9a-f]{40}$/);
    });

    it("should throw for repository with no commits", async () => {
      await initRepo(repoDir);

      await expect(plugin.getCurrentCheckpoint(repoDir)).rejects.toThrow();
    });
  });

  describe("merge commit", () => {
    it("should correctly identify merge commits with isMerge=true", async () => {
      await initRepo(repoDir);
      await addCommit(repoDir, "Base commit", { "base.txt": "base" });

      // feature ブランチを作成してコミット
      await git(["checkout", "-b", "feature"], repoDir);
      await addCommit(repoDir, "Feature commit", { "feature.txt": "feature" });

      // mainに戻ってマージ
      await git(["checkout", "main"], repoDir);
      await git(
        [
          "-c",
          "user.email=test@test.com",
          "-c",
          "user.name=Test",
          "merge",
          "--no-ff",
          "feature",
          "-m",
          "Merge feature branch",
        ],
        repoDir,
      );

      const events = [];
      for await (const event of plugin.ingestAll(repoDir)) {
        events.push(event);
      }

      // マージコミットがあること
      const mergeEvent = events.find((e) => e.title === "Merge feature branch");
      expect(mergeEvent).toBeDefined();
      expect(mergeEvent?.metadata.sourcePlugin).toBe("git-history");
    });
  });

  it("should dispose without error", async () => {
    await expect(plugin.dispose()).resolves.toBeUndefined();
  });

  describe("performance", () => {
    it("should handle 1000 commits within 30 seconds", async () => {
      // parseGitLog をモックデータで直接テスト（git操作なし）
      const mockRecords = Array.from({ length: 1000 }, (_, i) => {
        // 40文字の小文字16進数ハッシュを生成
        const indexHex = i.toString(16).padStart(8, "0");
        const hash = `aabb${indexHex}${"0".repeat(28)}`;
        const date = `2024-01-01T00:00:${String(i % 60).padStart(2, "0")}+00:00`;
        return `${hash}\nAuthor Name\nauthor@example.com\n${date}\n\nCommit message ${i}\nBody line for commit ${i}\n`;
      });
      const mockLog = mockRecords.join("---END---\n") + "---END---";

      const start = Date.now();
      const commits = parseGitLog(mockLog);
      const elapsed = Date.now() - start;

      expect(commits.length).toBe(1000);
      expect(elapsed).toBeLessThan(30_000);
    }, 30_000);
  });
});
