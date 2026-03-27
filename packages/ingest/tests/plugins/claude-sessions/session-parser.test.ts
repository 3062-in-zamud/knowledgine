import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseSessionFile,
  extractTextContent,
  isRelevantEntry,
} from "../../../src/plugins/claude-sessions/session-parser.js";

// isValidEntry はモジュール内部のため、間接的にテスト（parseSessionFile経由）

describe("extractTextContent", () => {
  it("should return string as-is", () => {
    expect(extractTextContent("hello world")).toBe("hello world");
  });

  it("should extract text blocks from array", () => {
    const content = [
      { type: "text", text: "Hello " },
      { type: "text", text: "World" },
    ];
    expect(extractTextContent(content)).toBe("Hello World");
  });

  it("should skip non-text blocks (tool_use, tool_result)", () => {
    const content = [
      { type: "text", text: "Before" },
      { type: "tool_use", text: "should be ignored" },
      { type: "tool_result", text: "also ignored" },
      { type: "text", text: " After" },
    ];
    expect(extractTextContent(content)).toBe("Before After");
  });

  it("should skip thinking blocks", () => {
    const content = [
      { type: "thinking", text: "internal thought" },
      { type: "text", text: "Visible text" },
    ];
    expect(extractTextContent(content)).toBe("Visible text");
  });

  it("should return empty string when all blocks are non-text (thinking only)", () => {
    const content = [{ type: "thinking", text: "internal" }, { type: "tool_use" }];
    expect(extractTextContent(content)).toBe("");
  });

  it("should handle mixed array with null and numbers", () => {
    const content = [
      null,
      42,
      { type: "text", text: "valid" },
      { type: "thinking" },
    ] as unknown as Array<{ type: string; text?: string }>;
    expect(extractTextContent(content)).toBe("valid");
  });

  it("should return empty string for empty array", () => {
    expect(extractTextContent([])).toBe("");
  });
});

describe("isRelevantEntry", () => {
  it("should return true for user", () => {
    expect(isRelevantEntry({ type: "user" })).toBe(true);
  });

  it("should return true for assistant", () => {
    expect(isRelevantEntry({ type: "assistant" })).toBe(true);
  });

  it("should return true for system", () => {
    expect(isRelevantEntry({ type: "system" })).toBe(true);
  });

  it("should return false for progress", () => {
    expect(isRelevantEntry({ type: "progress" })).toBe(false);
  });

  it("should return false for file-history-snapshot", () => {
    expect(isRelevantEntry({ type: "file-history-snapshot" })).toBe(false);
  });

  it("should return false for unknown types", () => {
    expect(isRelevantEntry({ type: "unknown" })).toBe(false);
    expect(isRelevantEntry({ type: "" })).toBe(false);
  });
});

describe("parseSessionFile", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "knowledgine-parser-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should parse normal JSONL with user and assistant messages", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "uuid-1",
        timestamp: "2024-01-01T00:00:00.000Z",
        cwd: "/home/user",
        message: { content: "Hello" },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "uuid-2",
        timestamp: "2024-01-01T00:00:01.000Z",
        cwd: "/home/user",
        gitBranch: "main",
        message: { content: "Hi there!" },
      }),
    ].join("\n");

    const filePath = join(testDir, "session.jsonl");
    await writeFile(filePath, lines);

    const messages = [];
    for await (const msg of parseSessionFile(filePath)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe("user");
    expect(messages[0].uuid).toBe("uuid-1");
    expect(messages[0].content).toBe("Hello");
    expect(messages[0].timestamp).toBeInstanceOf(Date);
    expect(messages[1].type).toBe("assistant");
    expect(messages[1].uuid).toBe("uuid-2");
    expect(messages[1].content).toBe("Hi there!");
    expect(messages[1].gitBranch).toBe("main");
  });

  it("should handle array content with text+tool_use mix (extract text only)", async () => {
    const content = [
      { type: "text", text: "I'll help you" },
      { type: "tool_use", id: "tool-1", name: "bash" },
      { type: "text", text: " with that." },
    ];
    const line = JSON.stringify({
      type: "assistant",
      uuid: "uuid-3",
      timestamp: "2024-01-01T00:00:00.000Z",
      cwd: "/home",
      message: { content },
    });

    const filePath = join(testDir, "session.jsonl");
    await writeFile(filePath, line);

    const messages = [];
    for await (const msg of parseSessionFile(filePath)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("I'll help you with that.");
  });

  it("should skip entries where all content is thinking blocks", async () => {
    const content = [{ type: "thinking", text: "let me think..." }];
    const line = JSON.stringify({
      type: "assistant",
      uuid: "uuid-4",
      timestamp: "2024-01-01T00:00:00.000Z",
      cwd: "/home",
      message: { content },
    });

    const filePath = join(testDir, "session.jsonl");
    await writeFile(filePath, line);

    const messages = [];
    for await (const msg of parseSessionFile(filePath)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(0);
  });

  it("should skip corrupted lines and continue processing", async () => {
    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "uuid-ok",
        timestamp: "2024-01-01T00:00:00.000Z",
        cwd: "/home",
        message: { content: "Valid message" },
      }),
      "not-valid-json{{{",
      JSON.stringify({
        type: "assistant",
        uuid: "uuid-ok2",
        timestamp: "2024-01-01T00:00:01.000Z",
        cwd: "/home",
        message: { content: "Another valid" },
      }),
    ].join("\n");

    const filePath = join(testDir, "session.jsonl");
    await writeFile(filePath, lines);

    const messages = [];
    for await (const msg of parseSessionFile(filePath)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("Valid message");
    expect(messages[1].content).toBe("Another valid");
  });

  it("should return 0 messages for empty file", async () => {
    const filePath = join(testDir, "empty.jsonl");
    await writeFile(filePath, "");

    const messages = [];
    for await (const msg of parseSessionFile(filePath)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(0);
  });

  it("should skip entries without type or uuid (isValidEntry = false)", async () => {
    const lines = [
      JSON.stringify({ uuid: "uuid-no-type", message: { content: "no type" } }),
      JSON.stringify({ type: "user", message: { content: "no uuid" } }),
      JSON.stringify({
        type: "user",
        uuid: "valid-uuid",
        timestamp: "2024-01-01T00:00:00.000Z",
        cwd: "/home",
        message: { content: "valid entry" },
      }),
    ].join("\n");

    const filePath = join(testDir, "session.jsonl");
    await writeFile(filePath, lines);

    const messages = [];
    for await (const msg of parseSessionFile(filePath)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("valid entry");
  });

  it("should skip progress and file-history-snapshot entries", async () => {
    const lines = [
      JSON.stringify({
        type: "progress",
        uuid: "uuid-p",
        timestamp: "2024-01-01T00:00:00.000Z",
        cwd: "/home",
        message: { content: "progress" },
      }),
      JSON.stringify({
        type: "file-history-snapshot",
        uuid: "uuid-fhs",
        timestamp: "2024-01-01T00:00:00.000Z",
        cwd: "/home",
        message: { content: "snapshot" },
      }),
      JSON.stringify({
        type: "user",
        uuid: "uuid-u",
        timestamp: "2024-01-01T00:00:00.000Z",
        cwd: "/home",
        message: { content: "real message" },
      }),
    ].join("\n");

    const filePath = join(testDir, "session.jsonl");
    await writeFile(filePath, lines);

    const messages = [];
    for await (const msg of parseSessionFile(filePath)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("real message");
  });
});
