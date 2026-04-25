import { describe, it, expect, afterEach } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, rm, writeFile, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  parseClineTask,
  readTaskHistory,
} from "../../../src/plugins/cline-sessions/session-parser.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("parseClineTask", () => {
  it("parses api_conversation_history.json from sample fixture", async () => {
    const taskDir = join(FIXTURES_DIR, "sample-task-folder/tasks/task-abc12345");
    const result = await parseClineTask(taskDir);
    expect(result.skipReason).toBeUndefined();
    expect(result.messages.length).toBeGreaterThan(0);
    const userMsg = result.messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toContain("TypeScript");
  });

  it("filters out tool_use-only assistant messages", async () => {
    const taskDir = join(FIXTURES_DIR, "sample-task-folder/tasks/task-abc12345");
    const result = await parseClineTask(taskDir);
    // The fixture has one assistant message with only a tool_use block.
    // It should NOT appear in messages (no extractable text).
    const onlyToolUse = result.messages.find((m) => m.role === "assistant" && m.content === "");
    expect(onlyToolUse).toBeUndefined();
  });

  it("preserves text from blocks even when tool_use is mixed in", async () => {
    const taskDir = join(FIXTURES_DIR, "sample-task-folder/tasks/task-abc12345");
    const result = await parseClineTask(taskDir);
    const conclusion = result.messages.find((m) =>
      m.content.includes("結論: bundler を選択しました"),
    );
    expect(conclusion).toBeDefined();
  });

  it("returns skipReason when both api and ui JSON are malformed", async () => {
    const taskDir = join(FIXTURES_DIR, "corrupted-task/tasks/task-broken");
    const result = await parseClineTask(taskDir);
    expect(result.messages).toEqual([]);
    expect(result.skipReason).toBeTruthy();
  });

  it("returns empty messages with skipReason for non-existent task dir", async () => {
    const result = await parseClineTask("/nonexistent/task-xyz");
    expect(result.messages).toEqual([]);
    expect(result.skipReason).toBeTruthy();
  });

  it("tolerates unknown_future_field in message objects (drift tolerance)", async () => {
    const taskDir = join(FIXTURES_DIR, "sample-task-folder/tasks/task-abc12345");
    const result = await parseClineTask(taskDir);
    // Last assistant in fixture has unknown_future_field; should still be parsed.
    expect(result.skipReason).toBeUndefined();
    expect(result.messages.length).toBeGreaterThan(0);
  });
});

describe("readTaskHistory", () => {
  it("loads HistoryItem array from state/taskHistory.json", async () => {
    const storageDir = join(FIXTURES_DIR, "sample-task-folder");
    const items = await readTaskHistory(storageDir);
    expect(items.length).toBe(1);
    expect(items[0]?.id).toBe("task-abc12345");
    expect(items[0]?.task).toContain("TypeScript");
    expect(items[0]?.cwdOnTaskInitialization).toContain("sample-app");
  });

  it("returns empty array when state/taskHistory.json is absent", async () => {
    const storageDir = join(FIXTURES_DIR, "empty-dir");
    const items = await readTaskHistory(storageDir);
    expect(items).toEqual([]);
  });

  it("returns empty array when storage dir itself is absent", async () => {
    const items = await readTaskHistory("/nonexistent/cline-storage");
    expect(items).toEqual([]);
  });
});

describe("parseClineTask — heap protection (>10MB skip)", () => {
  let tmpRoot: string | undefined;

  afterEach(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    }
  });

  it("skips api_conversation_history.json when its on-disk size exceeds 10MB and does NOT fall back to ui_messages.json", async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "cline-oversized-"));
    const taskDir = join(tmpRoot, "task-huge");
    await mkdir(taskDir, { recursive: true });
    const apiPath = join(taskDir, "api_conversation_history.json");
    // Create an 11MB sparse file by truncate(); contents are zero bytes,
    // larger than MAX_FILE_SIZE (10MB). This avoids actually allocating
    // 11MB of test memory while still exercising the size guard.
    await writeFile(apiPath, "[]");
    await truncate(apiPath, 11 * 1024 * 1024);
    // ui_messages.json with parseable content — must NOT be used because
    // the api file's hard skip should short-circuit.
    await writeFile(
      join(taskDir, "ui_messages.json"),
      JSON.stringify([{ ts: 1, type: "say", text: "should not be reached" }]),
    );

    const result = await parseClineTask(taskDir);
    expect(result.messages).toEqual([]);
    expect(result.skipReason).toMatch(/^api: file too large/);
  });
});
