import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, mkdir, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { ClineSessionsPlugin } from "../../../src/plugins/cline-sessions/index.js";
import type { NormalizedEvent } from "../../../src/types.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const SAMPLE = join(FIXTURES_DIR, "sample-task-folder");
const CORRUPTED = join(FIXTURES_DIR, "corrupted-task");
const EMPTY = join(FIXTURES_DIR, "empty-dir");

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe("ClineSessionsPlugin", () => {
  let plugin: ClineSessionsPlugin;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    plugin = new ClineSessionsPlugin();
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe("manifest", () => {
    it("has correct id, name, version, schemes, priority", () => {
      expect(plugin.manifest.id).toBe("cline-sessions");
      expect(plugin.manifest.name).toBe("Cline Sessions");
      expect(plugin.manifest.version).toBe("0.1.0");
      expect(plugin.manifest.schemes).toEqual(["cline-session://"]);
      expect(plugin.manifest.priority).toBe(1);
    });
  });

  describe("triggers", () => {
    it("declares only manual (no dead-code file_watcher)", () => {
      expect(plugin.triggers).toEqual([{ type: "manual" }]);
    });
  });

  describe("initialize", () => {
    it("returns ok:true when storage dir is missing (graceful)", async () => {
      const result = await plugin.initialize();
      expect(result.ok).toBe(true);
    });
  });

  describe("ingestAll — graceful skip", () => {
    it("yields 0 events when storage dir is absent", async () => {
      const events = await collect(plugin.ingestAll("/nonexistent/cline-storage"));
      expect(events).toEqual([]);
    });

    it("yields 0 events when tasks/ dir is empty", async () => {
      const events = await collect(plugin.ingestAll(EMPTY));
      expect(events).toEqual([]);
    });

    it("yields 0 events for corrupted task and writes a stderr warning starting with ⚠ Skipped (basename only)", async () => {
      const events = await collect(plugin.ingestAll(CORRUPTED));
      expect(events).toEqual([]);
      const calls = stderrSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(calls).toMatch(/⚠ Skipped \(task-broken\):/);
      // Absolute path must NOT leak into stderr
      expect(calls).not.toContain(CORRUPTED);
    });
  });

  describe("ingestAll — sample fixture", () => {
    let events: NormalizedEvent[];

    beforeEach(async () => {
      events = await collect(plugin.ingestAll(SAMPLE));
    });

    it("yields exactly one event per task directory", () => {
      expect(events.length).toBe(1);
    });

    it("uses cline-session://<storageHash8>/<taskId> sourceUri", () => {
      const ev = events[0]!;
      expect(ev.sourceUri).toMatch(/^cline-session:\/\/[0-9a-f]{8}\/task-abc12345$/);
    });

    it("eventType is capture", () => {
      expect(events[0]!.eventType).toBe("capture");
    });

    it("title starts with 'Cline: ' and includes the user task prefix", () => {
      expect(events[0]!.title).toMatch(/^Cline: /);
      expect(events[0]!.title.length).toBeLessThanOrEqual(7 + 60);
      expect(events[0]!.title).toContain("TypeScript");
    });

    it("content contains ### User: and ### Assistant: markers", () => {
      expect(events[0]!.content).toContain("### User:");
      expect(events[0]!.content).toContain("### Assistant:");
    });

    it("redacts API key (sk-ant-api03-...) via sanitizeContent", () => {
      const content = events[0]!.content;
      expect(content).not.toContain("sk-ant-api03-AAAA");
      expect(content).toContain("[REDACTED]");
    });

    it("metadata.tags includes cline and ai-session", () => {
      const tags = events[0]!.metadata.tags ?? [];
      expect(tags).toContain("cline");
      expect(tags).toContain("ai-session");
    });

    it("metadata.extra carries workspace, tokens and message count", () => {
      const extra = events[0]!.metadata.extra as Record<string, unknown> | undefined;
      expect(extra).toBeDefined();
      expect(extra?.["workspace"]).toContain("sample-app");
      expect(extra?.["tokensIn"]).toBe(1234);
      expect(extra?.["tokensOut"]).toBe(5678);
      expect(typeof extra?.["messageCount"]).toBe("number");
    });

    it("timestamp is a Date instance derived from history ts", () => {
      expect(events[0]!.timestamp).toBeInstanceOf(Date);
      expect(events[0]!.timestamp.getTime()).toBe(1714000000000);
    });
  });

  describe("ingestIncremental", () => {
    it("treats invalid checkpoint string as epoch (yields all)", async () => {
      const events = await collect(plugin.ingestIncremental(SAMPLE, "not-a-date"));
      expect(events.length).toBe(1);
    });

    it("filters tasks older than checkpoint by max mtime of 3 files", async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const events = await collect(plugin.ingestIncremental(SAMPLE, future));
      expect(events).toEqual([]);
    });

    it("includes task whose api_conversation_history mtime is newer than checkpoint", async () => {
      const tmpRoot = await mkdtemp(join(tmpdir(), "cline-incr-"));
      try {
        const taskDir = join(tmpRoot, "tasks", "task-recent");
        await mkdir(taskDir, { recursive: true });
        await writeFile(
          join(taskDir, "api_conversation_history.json"),
          JSON.stringify([{ role: "user", content: "hi" }]),
        );
        const now = Date.now() / 1000;
        await utimes(join(taskDir, "api_conversation_history.json"), now, now);
        const checkpoint = new Date(Date.now() - 10_000).toISOString();
        const events = await collect(plugin.ingestIncremental(tmpRoot, checkpoint));
        expect(events.length).toBe(1);
      } finally {
        await rm(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe("getCurrentCheckpoint", () => {
    it("returns epoch ISO when storage is empty", async () => {
      const cp = await plugin.getCurrentCheckpoint(EMPTY);
      expect(cp).toBe(new Date(0).toISOString());
    });

    it("returns epoch ISO when storage is missing", async () => {
      const cp = await plugin.getCurrentCheckpoint("/nonexistent/cline-storage");
      expect(cp).toBe(new Date(0).toISOString());
    });

    it("returns max mtime ISO for sample fixture", async () => {
      const cp = await plugin.getCurrentCheckpoint(SAMPLE);
      expect(cp).not.toBe(new Date(0).toISOString());
      expect(() => new Date(cp).toISOString()).not.toThrow();
    });
  });

  describe("dispose", () => {
    it("resolves without error", async () => {
      await expect(plugin.dispose()).resolves.toBeUndefined();
    });
  });
});
