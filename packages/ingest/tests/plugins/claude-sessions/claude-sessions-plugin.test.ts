import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm, utimes } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ClaudeSessionsPlugin } from "../../../src/plugins/claude-sessions/index.js";

function makeEntry(
  type: "user" | "assistant" | "system",
  uuid: string,
  content: string,
  timestamp = "2024-01-01T00:00:00.000Z",
  extra: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    type,
    uuid,
    timestamp,
    cwd: "/home/user",
    message: { content },
    ...extra,
  });
}

describe("ClaudeSessionsPlugin", () => {
  let plugin: ClaudeSessionsPlugin;
  let testDir: string;

  beforeEach(async () => {
    plugin = new ClaudeSessionsPlugin();
    testDir = join(tmpdir(), `knowledgine-sessions-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should have correct manifest", () => {
    expect(plugin.manifest.id).toBe("claude-sessions");
    expect(plugin.manifest.name).toBe("Claude Code Sessions");
    expect(plugin.manifest.version).toBe("0.1.0");
    expect(plugin.manifest.schemes).toEqual(["claude-session://"]);
    expect(plugin.manifest.priority).toBe(1);
  });

  it("should have correct triggers", () => {
    expect(plugin.triggers).toHaveLength(1);
    expect(plugin.triggers[0].type).toBe("file_watcher");
  });

  it("should initialize successfully", async () => {
    const result = await plugin.initialize();
    expect(result.ok).toBe(true);
  });

  it("should return ISO date as checkpoint", async () => {
    const checkpoint = await plugin.getCurrentCheckpoint(testDir);
    expect(checkpoint).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(() => new Date(checkpoint)).not.toThrow();
  });

  it("should dispose without error", async () => {
    await expect(plugin.dispose()).resolves.toBeUndefined();
  });

  describe("ingestAll", () => {
    it("should generate one summary event per session file", async () => {
      // セッション1
      const proj1Dir = join(testDir, "my-project");
      await mkdir(proj1Dir, { recursive: true });
      const session1Lines = [
        makeEntry("user", "uuid-1a", "Hello session 1", "2024-01-01T00:00:00.000Z"),
        makeEntry("assistant", "uuid-1b", "Hi session 1", "2024-01-01T00:00:01.000Z"),
      ].join("\n");
      await writeFile(join(proj1Dir, "session-abc.jsonl"), session1Lines);

      // セッション2
      const proj2Dir = join(testDir, "other-project");
      await mkdir(proj2Dir, { recursive: true });
      const session2Lines = [
        makeEntry("user", "uuid-2a", "Hello session 2", "2024-02-01T00:00:00.000Z"),
      ].join("\n");
      await writeFile(join(proj2Dir, "session-def.jsonl"), session2Lines);

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      // Each session file produces one summary event
      expect(events).toHaveLength(2);

      // All events are session type summaries
      expect(events.every((e) => e.eventType === "session")).toBe(true);

      // セッションサマリーの確認
      const sess1 = events.find((e) => e.sourceUri.includes("session-abc"));
      expect(sess1).toBeDefined();
      expect(sess1!.sourceUri).toBe("claude-session://my-project/session-abc");
      expect(sess1!.metadata.sourcePlugin).toBe("claude-sessions");
      expect(sess1!.metadata.project).toBe("my-project");
      expect(sess1!.timestamp).toBeInstanceOf(Date);
      expect(sess1!.content).toContain("Hello session 1");
    });

    it("should yield 0 events when directory does not exist", async () => {
      const nonExistent = join(testDir, "does-not-exist");

      const events = [];
      for await (const event of plugin.ingestAll(nonExistent)) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });

    it("should skip thinking-only messages in summary content", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      const content = JSON.stringify([{ type: "thinking", text: "hmm" }]);
      const lines = [
        // thinking-onlyエントリ（パーサーでスキップされる）
        JSON.stringify({
          type: "assistant",
          uuid: "thinking-uuid",
          timestamp: "2024-01-01T00:00:00.000Z",
          cwd: "/home",
          message: { content: JSON.parse(content) },
        }),
        // 有効なエントリ
        makeEntry("user", "valid-uuid", "Valid message", "2024-01-01T00:00:01.000Z"),
      ].join("\n");
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      // 1 session file → 1 summary event
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("session");
      // Summary should contain the valid user message
      expect(events[0].content).toContain("Valid message");
      // Summary should not contain "hmm" (thinking block was skipped by parser)
      expect(events[0].content).not.toContain("hmm");
    });

    it("should skip corrupted lines and still yield summary", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      const lines = [
        makeEntry("user", "uuid-ok", "OK message", "2024-01-01T00:00:00.000Z"),
        "CORRUPTED_LINE{{{",
        makeEntry("assistant", "uuid-ok2", "OK reply", "2024-01-01T00:00:01.000Z"),
      ].join("\n");
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      // 1 session file → 1 summary event (corrupted line skipped)
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("session");
      expect(events[0].content).toContain("OK message");
      expect(events[0].content).toContain("Messages: 2");
    });
  });

  describe("ingestIncremental", () => {
    it("should only process files with mtime >= checkpoint", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });

      // 古いファイル
      const oldFilePath = join(projDir, "old-session.jsonl");
      await writeFile(
        oldFilePath,
        makeEntry("user", "uuid-old", "Old message", "2023-01-01T00:00:00.000Z")
      );
      // 過去に設定
      const oldTime = new Date("2023-06-01T00:00:00.000Z");
      await utimes(oldFilePath, oldTime, oldTime);

      // 新しいファイル
      const newFilePath = join(projDir, "new-session.jsonl");
      await writeFile(
        newFilePath,
        makeEntry("user", "uuid-new", "New message", "2024-01-01T00:00:00.000Z")
      );

      // checkpoint: 2024年初め（新しいファイルのみ通る）
      const checkpoint = "2024-01-01T00:00:00.000Z";

      const events = [];
      for await (const event of plugin.ingestIncremental(testDir, checkpoint)) {
        events.push(event);
      }

      const sessionIds = events
        .filter((e) => e.eventType === "session")
        .map((e) => e.sourceUri);

      expect(sessionIds.some((u) => u.includes("new-session"))).toBe(true);
      expect(sessionIds.some((u) => u.includes("old-session"))).toBe(false);
    });

    it("should yield 0 events with future checkpoint", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      await writeFile(
        join(projDir, "session.jsonl"),
        makeEntry("user", "uuid-1", "Message", "2024-01-01T00:00:00.000Z")
      );

      // 未来日時checkpoint
      const futureCheckpoint = new Date(Date.now() + 999999999).toISOString();

      const events = [];
      for await (const event of plugin.ingestIncremental(testDir, futureCheckpoint)) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });

    it("should yield 0 events when directory does not exist", async () => {
      const nonExistent = join(testDir, "does-not-exist");
      const checkpoint = new Date().toISOString();

      const events = [];
      for await (const event of plugin.ingestIncremental(nonExistent, checkpoint)) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });
  });
});
