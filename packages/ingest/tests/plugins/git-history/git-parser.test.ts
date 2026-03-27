import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseGitLog,
  truncateDiff,
  getDiffsParallel,
  commitToNormalizedEvent,
  validateCheckpoint,
} from "../../../src/plugins/git-history/git-parser.js";

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
  await git(["checkout", "-b", "main"], dir);
}

describe("parseGitLog", () => {
  // 正確に40文字の小文字16進数SHA1ハッシュを使用
  const HASH1 = "aaaa1234567890abcdef1234567890abcdef1234";
  const HASH_A = "aaaa234567890123456789012345678901234aa1";
  const HASH_B = "bbbb234567890123456789012345678901234bb1";
  const HASH_PARENT1 = "c1c1234567890123456789012345678901234c1c";
  const HASH_PARENT2 = "c2c1234567890123456789012345678901234c2c";
  const HASH_C = "cccc234567890123456789012345678901234cc1";
  const HASH_D = "dddd234567890123456789012345678901234dd1";
  const HASH_E = "eeee234567890123456789012345678901234ee1";
  const HASH_F = "ffff234567890123456789012345678901234ff1";

  it("should parse a single commit", () => {
    const raw = `${HASH1}
John Doe
john@example.com
2024-01-15T10:00:00+09:00
abcd1234567890abcdef1234567890abcdef1234
Add feature X
This adds feature X with great detail.
---END---`;

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe(HASH1);
    expect(commits[0].authorDate).toBe("2024-01-15T10:00:00+09:00");
    expect(commits[0].authorName).toBe("John Doe");
    expect(commits[0].authorEmail).toBe("john@example.com");
    expect(commits[0].subject).toBe("Add feature X");
    expect(commits[0].body).toBe("This adds feature X with great detail.");
    expect(commits[0].isMerge).toBe(false);
  });

  it("should parse multiple commits", () => {
    const raw = `${HASH_A}
Alice
alice@example.com
2024-01-15T10:00:00+09:00

First commit

---END---
${HASH_B}
Bob
bob@example.com
2024-01-16T10:00:00+09:00

Second commit

---END---`;

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(2);
    expect(commits[0].hash).toBe(HASH_A);
    expect(commits[0].authorName).toBe("Alice");
    expect(commits[1].hash).toBe(HASH_B);
    expect(commits[1].authorName).toBe("Bob");
  });

  it("should parse merge commit with multiple parents", () => {
    const raw = `${HASH_C}
Carol
carol@example.com
2024-01-17T10:00:00+09:00
${HASH_PARENT1} ${HASH_PARENT2}
Merge branch 'feature'

---END---`;

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].isMerge).toBe(true);
    expect(commits[0].parents).toHaveLength(2);
  });

  it("should parse commit with empty body", () => {
    const raw = `${HASH_D}
Dave
dave@example.com
2024-01-18T10:00:00+09:00

Fix bug

---END---`;

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].body).toBe("");
  });

  it("should parse commit with Japanese subject", () => {
    const raw = `${HASH_E}
田中太郎
tanaka@example.com
2024-01-19T10:00:00+09:00

機能Xを追加する
詳細な説明がここに入ります。
---END---`;

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].subject).toBe("機能Xを追加する");
    expect(commits[0].body).toBe("詳細な説明がここに入ります。");
  });

  it("should skip records with invalid SHA1 hash", () => {
    const raw = `${HASH_F}
Eve
eve@example.com
2024-01-20T10:00:00+09:00

Good commit

---END---
not-a-valid-hash
Someone
someone@example.com
2024-01-21T10:00:00+09:00

Bad record

---END---`;

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe(HASH_F);
  });
});

describe("truncateDiff", () => {
  it("should return diff as-is when shorter than maxSize", () => {
    const diff = "small diff content";
    expect(truncateDiff(diff, 100)).toBe(diff);
  });

  it("should return diff as-is when equal to maxSize (boundary value)", () => {
    const diff = "a".repeat(100);
    expect(truncateDiff(diff, 100)).toBe(diff);
  });

  it("should truncate diff and append annotation when exceeds maxSize", () => {
    const diff = "a".repeat(200);
    const result = truncateDiff(diff, 100);
    expect(result).toBe("a".repeat(100) + "\n... [truncated]");
  });

  it("should use 50KB default when maxSize is not specified", () => {
    const smallDiff = "x".repeat(100);
    expect(truncateDiff(smallDiff)).toBe(smallDiff);

    const largeDiff = "x".repeat(51 * 1024);
    const result = truncateDiff(largeDiff);
    expect(result.endsWith("\n... [truncated]")).toBe(true);
    expect(result.length).toBe(50 * 1024 + "\n... [truncated]".length);
  });

  it("should return truncation marker when maxSize is 0", () => {
    const diff = "some content";
    const result = truncateDiff(diff, 0);
    expect(result).toBe("\n... [truncated]");
  });
});

describe("getDiffsParallel", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "knowledgine-diff-test-"));
    await initRepo(repoDir);
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("should return diffs for multiple hashes", async () => {
    await writeFile(join(repoDir, "file1.ts"), "content1");
    await git(["add", "."], repoDir);
    await git(["commit", "-m", "Commit 1"], repoDir);
    const hash1 = await git(["rev-parse", "HEAD"], repoDir);

    await writeFile(join(repoDir, "file2.ts"), "content2");
    await git(["add", "."], repoDir);
    await git(["commit", "-m", "Commit 2"], repoDir);
    const hash2 = await git(["rev-parse", "HEAD"], repoDir);

    await writeFile(join(repoDir, "file3.ts"), "content3");
    await git(["add", "."], repoDir);
    await git(["commit", "-m", "Commit 3"], repoDir);
    const hash3 = await git(["rev-parse", "HEAD"], repoDir);

    const result = await getDiffsParallel([hash1, hash2, hash3], { cwd: repoDir });

    expect(result.size).toBe(3);
    expect(result.get(hash1)).toContain("file1.ts");
    expect(result.get(hash2)).toContain("file2.ts");
    expect(result.get(hash3)).toContain("file3.ts");
  });

  it("should return empty map for empty hashes array", async () => {
    const result = await getDiffsParallel([], { cwd: repoDir });
    expect(result.size).toBe(0);
  });

  it("should use empty string for invalid hash and continue with others", async () => {
    await writeFile(join(repoDir, "file1.ts"), "content1");
    await git(["add", "."], repoDir);
    await git(["commit", "-m", "Commit 1"], repoDir);
    const hash1 = await git(["rev-parse", "HEAD"], repoDir);

    await writeFile(join(repoDir, "file3.ts"), "content3");
    await git(["add", "."], repoDir);
    await git(["commit", "-m", "Commit 3"], repoDir);
    const hash3 = await git(["rev-parse", "HEAD"], repoDir);

    // 存在しないハッシュ（有効なSHA1形式だが実在しない）
    const invalidHash = "0000000000000000000000000000000000000000";
    const result = await getDiffsParallel([hash1, invalidHash, hash3], { cwd: repoDir });

    expect(result.size).toBe(3);
    expect(result.get(hash1)).toContain("file1.ts");
    expect(result.get(invalidHash)).toBe("");
    expect(result.get(hash3)).toContain("file3.ts");
  });
});

describe("commitToNormalizedEvent", () => {
  const COMMIT_HASH = "abc1234567890abcdef1234567890abcdef1234a";
  const sampleCommit = {
    hash: COMMIT_HASH,
    authorDate: "2024-01-15T10:00:00+09:00",
    authorName: "John Doe",
    authorEmail: "john@example.com",
    parents: ["abcd1234567890abcdef1234567890abcdef1234"],
    subject: "Add feature X",
    body: "This is the body.",
    isMerge: false,
  };

  it("should produce a NormalizedEvent with correct sourceUri", () => {
    const event = commitToNormalizedEvent(sampleCommit, "diff content", "/repo/path");
    expect(event.sourceUri).toBe(`git:///repo/path/commit/${COMMIT_HASH}`);
  });

  it("should have eventType 'change'", () => {
    const event = commitToNormalizedEvent(sampleCommit, "", "/repo/path");
    expect(event.eventType).toBe("change");
  });

  it("should have timestamp as a Date instance", () => {
    const event = commitToNormalizedEvent(sampleCommit, "", "/repo/path");
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.timestamp.toISOString()).toContain("2024-01-15");
  });

  it("should extract relatedPaths from diff", () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/bar.ts b/src/bar.ts
index abc..def 100644`;

    const event = commitToNormalizedEvent(sampleCommit, diff, "/repo/path");
    expect(event.relatedPaths).toEqual(["src/foo.ts", "src/bar.ts"]);
  });

  it("should include branch in metadata when currentBranch is provided", () => {
    const event = commitToNormalizedEvent(sampleCommit, "", "/repo/path", "main");
    expect(event.metadata.branch).toBe("main");
  });

  it("should omit branch from metadata when currentBranch is undefined", () => {
    const event = commitToNormalizedEvent(sampleCommit, "", "/repo/path", undefined);
    expect(event.metadata.branch).toBeUndefined();
    expect("branch" in event.metadata).toBe(false);
  });

  it("should set correct project from repoPath basename", () => {
    const event = commitToNormalizedEvent(sampleCommit, "", "/repos/myproject");
    expect(event.metadata.project).toBe("myproject");
  });
});

describe("validateCheckpoint", () => {
  it("should return valid SHA1 hash", () => {
    const hash = "abc1234567890abcdef1234567890abcdef1234a";
    expect(validateCheckpoint(hash)).toBe(hash);
  });

  it("should throw for invalid string", () => {
    expect(() => validateCheckpoint("not-a-sha")).toThrow("Invalid checkpoint format");
  });

  it("should throw for empty string", () => {
    expect(() => validateCheckpoint("")).toThrow("Invalid checkpoint format");
  });

  it("should throw for SHA1 with uppercase letters", () => {
    expect(() => validateCheckpoint("ABC1234567890123456789012345678901234ABCD")).toThrow(
      "Invalid checkpoint format",
    );
  });

  it("should throw for truncated SHA1", () => {
    expect(() => validateCheckpoint("abc123")).toThrow("Invalid checkpoint format");
  });
});
