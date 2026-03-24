import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdir, rm, utimes } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { CursorSessionsPlugin } from "../../../src/plugins/cursor-sessions/index.js";
import type { NormalizedEvent } from "../../../src/types.js";

describe("CursorSessionsPlugin", () => {
  let plugin: CursorSessionsPlugin;
  let testDir: string;

  beforeEach(async () => {
    plugin = new CursorSessionsPlugin();
    testDir = join(tmpdir(), `knowledgine-cursor-plugin-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("manifest id should be 'cursor-sessions'", () => {
    expect(plugin.manifest.id).toBe("cursor-sessions");
    expect(plugin.manifest.name).toBe("Cursor IDE Sessions");
    expect(plugin.manifest.version).toBe("0.1.0");
    expect(plugin.manifest.schemes).toEqual(["cursor://"]);
    expect(plugin.manifest.priority).toBe(1);
  });

  it("should have correct triggers", () => {
    expect(plugin.triggers).toHaveLength(2);
    const fileWatcher = plugin.triggers.find((t) => t.type === "file_watcher");
    expect(fileWatcher).toBeDefined();
    const manual = plugin.triggers.find((t) => t.type === "manual");
    expect(manual).toBeDefined();
  });

  it("initialize() should return { ok: true } even when Cursor is not installed", async () => {
    // Cursorがインストールされていない環境でも正常終了
    const result = await plugin.initialize();
    expect(result.ok).toBe(true);
  });

  it("ingestAll() should yield 0 events when Cursor directory does not exist", async () => {
    const nonExistent = join(testDir, "does-not-exist");

    const events: NormalizedEvent[] = [];
    for await (const event of plugin.ingestAll(nonExistent)) {
      events.push(event);
    }

    expect(events).toHaveLength(0);
  });

  it("ingestAll() should generate events from mock data", async () => {
    // workspaceStorage 配下にハッシュディレクトリを作る
    const workspaceHash = "abc123def456";
    const hashDir = join(testDir, workspaceHash);
    await mkdir(hashDir, { recursive: true });

    const lines = [
      JSON.stringify({
        type: "user",
        content: "Hello Cursor test",
        timestamp: "2026-03-20T10:00:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        content: "Hello back!",
        timestamp: "2026-03-20T10:01:00Z",
      }),
    ].join("\n");

    await writeFile(join(hashDir, "session.jsonl"), lines);

    const events: NormalizedEvent[] = [];
    for await (const event of plugin.ingestAll(testDir)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].eventType).toBe("session");
    expect(events[0].sourceUri).toMatch(/^cursor:\/\//);
    expect(events[0].metadata.sourcePlugin).toBe("cursor-sessions");
  });

  it("ingestIncremental() should skip files with old mtime", async () => {
    const workspaceHash = "abc123def456";
    const hashDir = join(testDir, workspaceHash);
    await mkdir(hashDir, { recursive: true });

    // 古いファイル
    const oldFilePath = join(hashDir, "old-session.jsonl");
    await writeFile(
      oldFilePath,
      JSON.stringify({ type: "user", content: "old", timestamp: "2023-01-01T00:00:00Z" }),
    );
    const oldTime = new Date("2023-06-01T00:00:00.000Z");
    await utimes(oldFilePath, oldTime, oldTime);

    // 新しいファイル
    const newFilePath = join(hashDir, "new-session.jsonl");
    await writeFile(
      newFilePath,
      JSON.stringify({ type: "user", content: "new", timestamp: "2026-01-01T00:00:00Z" }),
    );

    const checkpoint = "2024-01-01T00:00:00.000Z";

    const events: NormalizedEvent[] = [];
    for await (const event of plugin.ingestIncremental(testDir, checkpoint)) {
      events.push(event);
    }

    const uris = events.map((e) => e.sourceUri);
    expect(uris.some((u) => u.includes("new-session"))).toBe(true);
    expect(uris.some((u) => u.includes("old-session"))).toBe(false);
  });

  it("sanitizeContent should be applied (API key replaced with [REDACTED])", async () => {
    const workspaceHash = "abc123def456";
    const hashDir = join(testDir, workspaceHash);
    await mkdir(hashDir, { recursive: true });

    const apiKey = "sk-abc1234567890123456789012345678901234567";
    await writeFile(
      join(hashDir, "session.jsonl"),
      JSON.stringify({
        type: "user",
        content: `My key is ${apiKey}`,
        timestamp: "2026-01-01T00:00:00Z",
      }),
    );

    const events: NormalizedEvent[] = [];
    for await (const event of plugin.ingestAll(testDir)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).not.toContain(apiKey);
    expect(events[0].content).toContain("[REDACTED]");
  });

  it("dispose() should complete without error", async () => {
    await expect(plugin.dispose()).resolves.toBeUndefined();
  });

  it("getCurrentCheckpoint() should return ISO string", async () => {
    const cp = await plugin.getCurrentCheckpoint(testDir);
    expect(() => new Date(cp)).not.toThrow();
    expect(cp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("getCurrentCheckpoint() should return epoch when no files exist", async () => {
    const emptyDir = join(testDir, "empty");
    await mkdir(emptyDir, { recursive: true });
    const cp = await plugin.getCurrentCheckpoint(emptyDir);
    expect(cp).toBe(new Date(0).toISOString());
  });
});
