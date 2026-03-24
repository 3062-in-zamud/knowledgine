import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  parseCursorSessionFile,
  cursorEntryToNormalizedEvent,
} from "../../../src/plugins/cursor-sessions/cursor-parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("parseCursorSessionFile", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `knowledgine-cursor-parser-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should parse entries from mock JSONL fixture", async () => {
    const fixturePath = join(__dirname, "../../fixtures/cursor-sessions/mock-session.jsonl");
    const entries: unknown[] = [];
    for await (const entry of parseCursorSessionFile(fixturePath)) {
      entries.push(entry);
    }
    expect(entries).toHaveLength(3);
  });

  it("should skip invalid JSON lines", async () => {
    const filePath = join(testDir, "session.jsonl");
    await writeFile(
      filePath,
      [
        JSON.stringify({ type: "user", content: "valid", timestamp: "2026-01-01T00:00:00Z" }),
        "INVALID_JSON{{{",
        JSON.stringify({
          type: "assistant",
          content: "also valid",
          timestamp: "2026-01-01T00:01:00Z",
        }),
      ].join("\n"),
    );

    const entries: unknown[] = [];
    for await (const entry of parseCursorSessionFile(filePath)) {
      entries.push(entry);
    }
    expect(entries).toHaveLength(2);
  });

  it("should return 0 entries for empty file", async () => {
    const filePath = join(testDir, "empty.jsonl");
    await writeFile(filePath, "");

    const entries: unknown[] = [];
    for await (const entry of parseCursorSessionFile(filePath)) {
      entries.push(entry);
    }
    expect(entries).toHaveLength(0);
  });

  it("should parse type and content fields correctly", async () => {
    const filePath = join(testDir, "session.jsonl");
    await writeFile(
      filePath,
      JSON.stringify({ type: "user", content: "Hello Cursor", timestamp: "2026-01-01T00:00:00Z" }),
    );

    const entries: Array<{ type: string; content: string; timestamp: string }> = [];
    for await (const entry of parseCursorSessionFile(filePath)) {
      entries.push(entry as { type: string; content: string; timestamp: string });
    }
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("user");
    expect(entries[0].content).toBe("Hello Cursor");
  });
});

describe("cursorEntryToNormalizedEvent", () => {
  it("should return correct NormalizedEvent structure", () => {
    const entries = [
      { type: "user", content: "Hello", timestamp: "2026-03-20T10:00:00Z" },
      { type: "assistant", content: "Hi there", timestamp: "2026-03-20T10:01:00Z" },
    ];
    const event = cursorEntryToNormalizedEvent(entries, "abc123", "mock-session.jsonl");

    expect(event).toBeDefined();
    expect(event.eventType).toBe("session");
    expect(event.sourceUri).toMatch(/^cursor:\/\//);
    expect(event.sourceUri).toContain("abc123");
    expect(event.sourceUri).toContain("mock-session.jsonl");
    expect(event.metadata.sourcePlugin).toBe("cursor-sessions");
    expect(event.content).toContain("Hello");
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it("eventType should be 'session'", () => {
    const entries = [{ type: "user", content: "test", timestamp: "2026-01-01T00:00:00Z" }];
    const event = cursorEntryToNormalizedEvent(entries, "hash1", "file.jsonl");
    expect(event.eventType).toBe("session");
  });

  it("sourceUri should start with cursor://", () => {
    const entries = [{ type: "user", content: "test", timestamp: "2026-01-01T00:00:00Z" }];
    const event = cursorEntryToNormalizedEvent(entries, "hash1", "file.jsonl");
    expect(event.sourceUri.startsWith("cursor://")).toBe(true);
  });

  it("should handle empty entries gracefully", () => {
    const event = cursorEntryToNormalizedEvent([], "hash1", "file.jsonl");
    expect(event.eventType).toBe("session");
    expect(event.timestamp).toBeInstanceOf(Date);
  });
});
