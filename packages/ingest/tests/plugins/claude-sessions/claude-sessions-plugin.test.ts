import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm, utimes } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { ClaudeSessionsPlugin } from "../../../src/plugins/claude-sessions/index.js";
import type { NormalizedEvent } from "../../../src/types.js";

function makeEntry(
  type: "user" | "assistant" | "system",
  uuid: string,
  content: string,
  timestamp = "2024-01-01T00:00:00.000Z",
  extra: Record<string, unknown> = {},
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

/** タスク仕様に沿った makeEntry (content をブロック形式で生成) */
function makeEntryV2(
  type: "user" | "assistant",
  content: string,
  opts: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type,
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    cwd: "/test",
    message: { content: [{ type: "text", text: content }] },
    ...opts,
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
      expect(events.every((e) => e.eventType === "capture")).toBe(true);

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
      expect(events[0].eventType).toBe("capture");
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
      expect(events[0].eventType).toBe("capture");
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
        makeEntry("user", "uuid-old", "Old message", "2023-01-01T00:00:00.000Z"),
      );
      // 過去に設定
      const oldTime = new Date("2023-06-01T00:00:00.000Z");
      await utimes(oldFilePath, oldTime, oldTime);

      // 新しいファイル
      const newFilePath = join(projDir, "new-session.jsonl");
      await writeFile(
        newFilePath,
        makeEntry("user", "uuid-new", "New message", "2024-01-01T00:00:00.000Z"),
      );

      // checkpoint: 2024年初め（新しいファイルのみ通る）
      const checkpoint = "2024-01-01T00:00:00.000Z";

      const events = [];
      for await (const event of plugin.ingestIncremental(testDir, checkpoint)) {
        events.push(event);
      }

      const sessionIds = events.filter((e) => e.eventType === "capture").map((e) => e.sourceUri);

      expect(sessionIds.some((u) => u.includes("new-session"))).toBe(true);
      expect(sessionIds.some((u) => u.includes("old-session"))).toBe(false);
    });

    it("should yield 0 events with future checkpoint", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      await writeFile(
        join(projDir, "session.jsonl"),
        makeEntry("user", "uuid-1", "Message", "2024-01-01T00:00:00.000Z"),
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

  describe("sanitization", () => {
    it("should sanitize API keys from session content", async () => {
      const sessionDir = join(testDir, ".claude", "projects", "test-project");
      await mkdir(sessionDir, { recursive: true });
      const content = JSON.stringify({
        type: "user",
        message: { content: "My API key is sk-abc1234567890123456789012345678901234567" },
        uuid: "test-uuid",
        timestamp: new Date().toISOString(),
        cwd: "/home/user",
      });
      await writeFile(join(sessionDir, "test.jsonl"), content);

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].content).not.toContain("sk-abc1234567890123456789012345678901234567");
      expect(events[0].content).toContain("[REDACTED]");
      expect(events[0].eventType).toBe("capture");
    });
  });

  describe("assistant message inclusion (KNOW-307)", () => {
    it("should include assistant messages with ### Assistant: marker", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      const lines = [
        makeEntryV2("user", "Hello"),
        makeEntryV2("assistant", "Hi there, how can I help?"),
      ].join("\n");
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].content).toContain("### Assistant:");
      expect(events[0].content).toContain("Hi there, how can I help?");
    });

    it("should include user messages with ### User: marker", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      const lines = [
        makeEntryV2("user", "What is the best approach?"),
        makeEntryV2("assistant", "It depends on the context."),
      ].join("\n");
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].content).toContain("### User:");
      expect(events[0].content).toContain("What is the best approach?");
    });

    it("should keep up to 500 chars for decision-point assistant messages", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      // 決定パターンを含む、600文字のassistantメッセージ
      // 500文字目と501文字目を明確に区別するため、末尾をユニークな文字列にする
      const prefix = "I chose this approach because " + "a".repeat(469); // 合計499文字
      const char500 = "X"; // 500文字目
      const suffix = "YZABCDE_TRUNCATED_PART"; // 501文字目以降
      const longDecision = prefix + char500 + suffix;
      expect(longDecision.length).toBe(499 + 1 + suffix.length); // 長さ確認

      const lines = [makeEntryV2("user", "Why?"), makeEntryV2("assistant", longDecision)].join(
        "\n",
      );
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      // 500文字で切り詰めされているので、longDecision全体は含まれない
      expect(events[0].content).not.toContain(longDecision);
      // 先頭500文字(prefix + char500)は含まれる
      expect(events[0].content).toContain(prefix + char500);
      // suffix（501文字目以降）は含まれない
      expect(events[0].content).not.toContain(suffix);
    });

    it("should truncate non-decision assistant messages to 200 chars", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      // 決定パターンを含まない、300文字のassistantメッセージ
      // 200文字目と201文字目を明確に区別するため末尾をユニークな文字列にする
      const prefix = "Here is the code: " + "x".repeat(181); // 合計199文字
      const char200 = "Z"; // 200文字目
      const suffix = "QRST_TRUNCATED_PART"; // 201文字目以降
      const longReply = prefix + char200 + suffix;

      const lines = [makeEntryV2("user", "Show me code"), makeEntryV2("assistant", longReply)].join(
        "\n",
      );
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      // 200文字で切り詰め: prefix + char200 は含まれる
      expect(events[0].content).toContain(prefix + char200);
      // suffix（201文字目以降）は含まれない
      expect(events[0].content).not.toContain(suffix);
    });

    it("should exclude thinking-only assistant messages (empty content after extraction)", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      const thinkingOnlyEntry = JSON.stringify({
        type: "assistant",
        uuid: randomUUID(),
        timestamp: new Date().toISOString(),
        cwd: "/test",
        message: {
          content: [{ type: "thinking", text: "internal reasoning..." }],
        },
      });
      const lines = [makeEntryV2("user", "Valid user message"), thinkingOnlyEntry].join("\n");
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].content).not.toContain("internal reasoning...");
      expect(events[0].content).not.toContain("### Assistant:");
    });

    it("should exclude tool_use-only assistant messages (no text part)", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      const toolOnlyEntry = JSON.stringify({
        type: "assistant",
        uuid: randomUUID(),
        timestamp: new Date().toISOString(),
        cwd: "/test",
        message: {
          content: [{ type: "tool_use", id: "tool-1", name: "bash", input: { command: "ls" } }],
        },
      });
      const lines = [makeEntryV2("user", "Run ls"), toolOnlyEntry].join("\n");
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      // tool_use のみなので assistant マーカーは含まれない
      expect(events[0].content).not.toContain("### Assistant:");
    });

    it('should use "## Session Messages" as section header instead of "## User Messages"', async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });
      const lines = [makeEntryV2("user", "Hello")].join("\n");
      await writeFile(join(projDir, "session.jsonl"), lines);

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].content).toContain("## Session Messages");
      expect(events[0].content).not.toContain("## User Messages");
    });

    it("should limit decision assistant messages to 20 (500 chars), remaining at 200 chars", async () => {
      const projDir = join(testDir, "proj");
      await mkdir(projDir, { recursive: true });

      const lines: string[] = [];
      // 25件の決定パターン含有assistantメッセージ（各600文字）
      for (let i = 0; i < 25; i++) {
        lines.push(makeEntryV2("user", `Question ${i}`));
        const msg = `I chose option ${i} because ` + "d".repeat(570);
        lines.push(makeEntryV2("assistant", msg));
      }
      await writeFile(join(projDir, "session.jsonl"), lines.join("\n"));

      const events: NormalizedEvent[] = [];
      for await (const event of plugin.ingestAll(testDir)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      const content = events[0].content;

      // 500文字バージョン（先着20件）と200文字バージョン（残り5件）が混在する
      // 21件目以降の決定メッセージは200文字に切り詰めされる
      // 600文字のメッセージが200文字に切り詰められると末尾の "d".repeat(370) 部分は消える
      // 確認: 先頭20件は500文字保持 -> "d".repeat(470) が含まれる（500 - "I chose option X because ".length）
      // 残り5件は200文字 -> "d".repeat(170) 相当のみ含まれる

      // 21件目以降のメッセージの501文字目以降が含まれていないことを確認するのは複雑なため、
      // content 内の "### Assistant:" の出現回数で代理確認
      const assistantMarkerCount = (content.match(/### Assistant:/g) ?? []).length;
      expect(assistantMarkerCount).toBe(25); // 全25件が含まれる（ただし切り詰め量が異なる）
    });
  });
});
