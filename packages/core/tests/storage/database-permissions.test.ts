import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, statSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase } from "../../src/storage/database.js";

describe("database file permissions", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true });
      } catch {}
    }
    dirs.length = 0;
  });

  it("should set DB file to 600 and directory to 700 on Unix", () => {
    if (process.platform === "win32") return;
    const tmpDir = mkdtempSync(join(tmpdir(), "kn-perm-"));
    dirs.push(tmpDir);
    const dbPath = join(tmpDir, ".knowledgine", "test.db");
    const db = createDatabase(dbPath);
    db.close();

    const fileStat = statSync(dbPath);
    const dirStat = statSync(join(tmpDir, ".knowledgine"));
    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it("should not throw for :memory: databases", () => {
    const db = createDatabase(":memory:");
    db.close(); // No chmod should occur
  });
});
