import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";

// Mock ObserverAgent and ReflectorAgent before importing ingestCommand
const mockObserveBatch = vi.fn();
const mockReflectBatch = vi.fn();

vi.mock("@knowledgine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knowledgine/core")>();
  return {
    ...actual,
    ObserverAgent: vi.fn().mockImplementation(() => ({
      observeBatch: mockObserveBatch,
    })),
    ReflectorAgent: vi.fn().mockImplementation(() => ({
      reflectBatch: mockReflectBatch,
    })),
    loadRcFile: vi.fn().mockReturnValue(null),
    createLLMProvider: vi.fn().mockReturnValue(undefined),
  };
});

import { ingestCommand } from "../../src/commands/ingest.js";
import { ObserverAgent, ReflectorAgent, loadRcFile } from "@knowledgine/core";

describe("--observe flag", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-observe-test-"));
    execFileSync("git", ["init"], { cwd: testDir });
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });
    writeFileSync(join(testDir, "test.md"), "# Test\n\nContent for observer testing");

    // Reset mocks
    vi.clearAllMocks();
    vi.mocked(loadRcFile).mockReturnValue(null);
    mockObserveBatch.mockResolvedValue([]);
    mockReflectBatch.mockResolvedValue([]);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should not run observer by default", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ingestCommand({ source: "markdown", path: testDir });
    expect(process.exitCode).toBeUndefined();
    expect(ObserverAgent).not.toHaveBeenCalled();
    expect(ReflectorAgent).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("should run observer when --observe flag is set", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockObserveBatch.mockResolvedValue([
      {
        noteId: 1,
        vectors: [],
        patterns: [],
        entities: [],
        processingMode: "rule",
        processingTimeMs: 10,
      },
    ]);
    mockReflectBatch.mockResolvedValue([
      {
        noteId: 1,
        contradictions: [],
        deprecationCandidates: [],
        versionUpdates: [],
        processingMode: "rule",
        processingTimeMs: 5,
      },
    ]);

    await ingestCommand({ source: "markdown", path: testDir, observe: true });
    expect(process.exitCode).toBeUndefined();
    expect(ObserverAgent).toHaveBeenCalled();
    expect(ReflectorAgent).toHaveBeenCalled();
    expect(mockObserveBatch).toHaveBeenCalled();
    expect(mockReflectBatch).toHaveBeenCalled();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("should skip observer when --no-observe flag is set", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // observe: false explicitly overrides rc config
    vi.mocked(loadRcFile).mockReturnValue({ observer: { enabled: true } });

    await ingestCommand({ source: "markdown", path: testDir, observe: false });
    expect(process.exitCode).toBeUndefined();
    expect(ObserverAgent).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("should respect observer.enabled in rc config", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(loadRcFile).mockReturnValue({ observer: { enabled: true } });
    mockObserveBatch.mockResolvedValue([]);
    mockReflectBatch.mockResolvedValue([]);

    await ingestCommand({ source: "markdown", path: testDir });
    expect(process.exitCode).toBeUndefined();
    expect(ObserverAgent).toHaveBeenCalled();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("should cap notes at --observe-limit", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Write multiple markdown files to get multiple noteIds
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(testDir, `note${i}.md`), `# Note ${i}\n\nContent ${i}`);
    }

    mockObserveBatch.mockResolvedValue([]);
    mockReflectBatch.mockResolvedValue([]);

    await ingestCommand({ source: "markdown", path: testDir, observe: true, observeLimit: 2 });
    expect(process.exitCode).toBeUndefined();

    expect(mockObserveBatch).toHaveBeenCalled();
    const notesArg = mockObserveBatch.mock.calls[0][0] as unknown[];
    expect(notesArg.length).toBeLessThanOrEqual(2);
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("should run in rule-based mode without LLM", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // loadRcFile returns config without llm
    vi.mocked(loadRcFile).mockReturnValue({ observer: { enabled: true } });
    mockObserveBatch.mockResolvedValue([]);
    mockReflectBatch.mockResolvedValue([]);

    await ingestCommand({ source: "markdown", path: testDir });
    expect(process.exitCode).toBeUndefined();
    expect(ObserverAgent).toHaveBeenCalled();
    // Should log rule-based mode message
    const logCalls = logSpy.mock.calls.map((c) => c.join(" "));
    const hasRuleBasedMsg = logCalls.some((msg) => msg.includes("rule-based"));
    expect(hasRuleBasedMsg).toBe(true);
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
