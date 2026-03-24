import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// gh-parser モジュールをモック
vi.mock("../../../src/plugins/github/gh-parser.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../src/plugins/github/gh-parser.js")>();
  return {
    ...original,
    execGh: vi.fn(),
    checkGhAuth: vi.fn(),
    checkGhVersion: vi.fn(),
  };
});

import { CicdPlugin } from "../../../src/plugins/cicd/index.js";
import { execGh, checkGhAuth, checkGhVersion } from "../../../src/plugins/github/gh-parser.js";

const mockedExecGh = vi.mocked(execGh);
const mockedCheckGhAuth = vi.mocked(checkGhAuth);
const mockedCheckGhVersion = vi.mocked(checkGhVersion);

const fixturesDir = join(__dirname, "../../fixtures/cicd");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("CicdPlugin", () => {
  let plugin: CicdPlugin;

  beforeEach(() => {
    plugin = new CicdPlugin();
    vi.clearAllMocks();
  });

  it("should have manifest id 'cicd'", () => {
    expect(plugin.manifest.id).toBe("cicd");
  });

  it("should have correct manifest", () => {
    expect(plugin.manifest.name).toBe("CI/CD (GitHub Actions)");
    expect(plugin.manifest.version).toBe("0.1.0");
    expect(plugin.manifest.schemes).toEqual(["cicd://"]);
    expect(plugin.manifest.priority).toBe(2);
  });

  it("should have correct triggers", () => {
    expect(plugin.triggers).toHaveLength(2);
    expect(plugin.triggers[0]).toEqual({ type: "scheduled", cron: "*/30 * * * *" });
    expect(plugin.triggers[1]).toEqual({ type: "manual" });
  });

  describe("initialize", () => {
    it("should return { ok: false } when gh is not authenticated", async () => {
      mockedCheckGhVersion.mockResolvedValue({ ok: true, version: "2.45.0" });
      mockedCheckGhAuth.mockResolvedValue(false);

      const result = await plugin.initialize();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not authenticated");
    });

    it("should return { ok: true } when gh is authenticated", async () => {
      mockedCheckGhVersion.mockResolvedValue({ ok: true, version: "2.45.0" });
      mockedCheckGhAuth.mockResolvedValue(true);

      const result = await plugin.initialize();
      expect(result.ok).toBe(true);
    });

    it("should return { ok: false } when version check fails", async () => {
      mockedCheckGhVersion.mockResolvedValue({ ok: false, error: "gh CLI not found" });

      const result = await plugin.initialize();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("gh CLI not found");
    });
  });

  describe("ingestAll", () => {
    it("should yield events from mock run list", async () => {
      const runsFixture = loadFixture("runs.json");
      const failureDetailFixture = loadFixture("run-detail-failure.json");

      mockedExecGh
        .mockResolvedValueOnce(runsFixture) // run list
        .mockResolvedValueOnce(failureDetailFixture); // detail for failure run 12346

      const events = [];
      for await (const event of plugin.ingestAll("cicd://owner/repo")) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe("ci_result");
      expect(events[1].eventType).toBe("ci_result");
    });

    it("should call detail fetch for failure runs", async () => {
      const runsFixture = loadFixture("runs.json");
      const failureDetailFixture = loadFixture("run-detail-failure.json");

      mockedExecGh.mockResolvedValueOnce(runsFixture).mockResolvedValueOnce(failureDetailFixture);

      const events = [];
      for await (const event of plugin.ingestAll("cicd://owner/repo")) {
        events.push(event);
      }

      // runs list + detail for failure run = 2 calls
      expect(mockedExecGh).toHaveBeenCalledTimes(2);
      // Second call should be for run detail
      const detailCall = mockedExecGh.mock.calls[1][0];
      expect(detailCall).toContain("run");
      expect(detailCall).toContain("view");
      expect(detailCall).toContain("12346");
    });

    it("should not call detail fetch for success runs", async () => {
      const runsFixture = loadFixture("runs.json");
      const failureDetailFixture = loadFixture("run-detail-failure.json");

      mockedExecGh.mockResolvedValueOnce(runsFixture).mockResolvedValueOnce(failureDetailFixture);

      const events = [];
      for await (const event of plugin.ingestAll("cicd://owner/repo")) {
        events.push(event);
      }

      // Should only fetch detail for the failure run (not success run)
      // runs.json has 1 success + 1 failure, so 1 list + 1 detail = 2 calls
      expect(mockedExecGh).toHaveBeenCalledTimes(2);
    });

    it("should yield 0 events for empty run list", async () => {
      const emptyFixture = loadFixture("empty.json");
      mockedExecGh.mockResolvedValueOnce(emptyFixture);

      const events = [];
      for await (const event of plugin.ingestAll("cicd://owner/repo")) {
        events.push(event);
      }

      expect(events).toHaveLength(0);
    });

    it("should include failure step info in event content for failed runs", async () => {
      const runsFixture = loadFixture("runs.json");
      const failureDetailFixture = loadFixture("run-detail-failure.json");

      mockedExecGh.mockResolvedValueOnce(runsFixture).mockResolvedValueOnce(failureDetailFixture);

      const events = [];
      for await (const event of plugin.ingestAll("cicd://owner/repo")) {
        events.push(event);
      }

      const failureEvent = events.find((e) => e.metadata.extra?.conclusion === "failure");
      expect(failureEvent).toBeDefined();
      expect(failureEvent!.content).toContain("Run tests");
    });
  });

  describe("ingestIncremental", () => {
    it("should only yield runs after checkpoint", async () => {
      const runsFixture = loadFixture("runs.json");
      const failureDetailFixture = loadFixture("run-detail-failure.json");

      mockedExecGh.mockResolvedValueOnce(runsFixture).mockResolvedValueOnce(failureDetailFixture);

      // checkpoint is before the first run (2026-03-20T10:00:00Z)
      const checkpoint = "2026-03-20T09:00:00Z";
      const events = [];
      for await (const event of plugin.ingestIncremental("cicd://owner/repo", checkpoint)) {
        events.push(event);
      }

      // Both runs are after checkpoint
      expect(events).toHaveLength(2);
    });

    it("should filter out runs at or before checkpoint", async () => {
      const runsFixture = loadFixture("runs.json");

      mockedExecGh.mockResolvedValueOnce(runsFixture);

      // checkpoint is after both runs
      const checkpoint = "2026-03-20T12:00:00Z";
      const events = [];
      for await (const event of plugin.ingestIncremental("cicd://owner/repo", checkpoint)) {
        events.push(event);
      }

      // Both runs (10:00 and 11:00) are before checkpoint (12:00)
      expect(events).toHaveLength(0);
    });

    it("should only yield runs strictly after checkpoint", async () => {
      const runsFixture = loadFixture("runs.json");
      const failureDetailFixture = loadFixture("run-detail-failure.json");

      mockedExecGh.mockResolvedValueOnce(runsFixture).mockResolvedValueOnce(failureDetailFixture);

      // checkpoint is between two runs
      const checkpoint = "2026-03-20T10:30:00Z";
      const events = [];
      for await (const event of plugin.ingestIncremental("cicd://owner/repo", checkpoint)) {
        events.push(event);
      }

      // Only the second run (11:00) is after checkpoint
      expect(events).toHaveLength(1);
      expect(events[0].metadata.sourceId).toBe("12346");
    });
  });

  describe("getCurrentCheckpoint", () => {
    it("should return latest run createdAt", async () => {
      const runsFixture = loadFixture("runs.json");
      mockedExecGh.mockResolvedValueOnce(runsFixture);

      const checkpoint = await plugin.getCurrentCheckpoint("cicd://owner/repo");
      // Latest run in fixture is 2026-03-20T11:00:00Z (databaseId: 12346)
      expect(checkpoint).toBe("2026-03-20T11:00:00Z");
    });

    it("should return epoch when no runs exist", async () => {
      const emptyFixture = loadFixture("empty.json");
      mockedExecGh.mockResolvedValueOnce(emptyFixture);

      const checkpoint = await plugin.getCurrentCheckpoint("cicd://owner/repo");
      expect(checkpoint).toBe(new Date(0).toISOString());
    });
  });

  describe("dispose", () => {
    it("should dispose without error", async () => {
      await expect(plugin.dispose()).resolves.toBeUndefined();
    });
  });

  describe("execWithRetry / Rate Limit", () => {
    it("should retry on rate limit error and succeed on second attempt", async () => {
      vi.useFakeTimers();
      const runsFixture = loadFixture("runs.json");
      const failureDetailFixture = loadFixture("run-detail-failure.json");

      mockedExecGh
        .mockRejectedValueOnce(new Error("API rate limit exceeded"))
        .mockResolvedValueOnce(runsFixture)
        .mockResolvedValueOnce(failureDetailFixture);

      const promise = (async () => {
        const events = [];
        for await (const event of plugin.ingestAll("cicd://owner/repo")) {
          events.push(event);
        }
        return events;
      })();

      // Advance timers to trigger retry delay
      await vi.runAllTimersAsync();
      const events = await promise;

      expect(events).toHaveLength(2);
      expect(mockedExecGh).toHaveBeenCalledTimes(3); // 1 rate limit fail + 1 runs + 1 detail

      vi.useRealTimers();
    }, 15_000);

    it("should not retry on non-rate-limit errors", async () => {
      mockedExecGh.mockRejectedValueOnce(new Error("network error"));

      await expect(async () => {
        for await (const _ of plugin.ingestAll("cicd://owner/repo")) {
          // consume
        }
      }).rejects.toThrow("network error");

      expect(mockedExecGh).toHaveBeenCalledTimes(1);
    });

    it("should throw after max rate limit retries exhausted", async () => {
      vi.useFakeTimers();

      mockedExecGh
        .mockRejectedValueOnce(new Error("API rate limit exceeded"))
        .mockRejectedValueOnce(new Error("API rate limit exceeded"))
        .mockRejectedValueOnce(new Error("API rate limit exceeded"));

      const promise = expect(async () => {
        for await (const _ of plugin.ingestAll("cicd://owner/repo")) {
          // consume
        }
      }).rejects.toThrow("rate limit");

      await vi.runAllTimersAsync();
      await promise;

      vi.useRealTimers();
    }, 30_000);
  });
});
