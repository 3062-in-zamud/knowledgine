import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const {
  mockCreateDefaultRegistry,
  mockInitializePlugins,
  mockIngestEngineIngest,
  mockIsRepositoryNotFoundError,
  mockDbClose,
} = vi.hoisted(() => ({
  mockCreateDefaultRegistry: vi.fn(),
  mockInitializePlugins: vi.fn(),
  mockIngestEngineIngest: vi.fn(),
  mockIsRepositoryNotFoundError: vi.fn(),
  mockDbClose: vi.fn(),
}));

vi.mock("@knowledgine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knowledgine/core")>();
  return {
    ...actual,
    defineConfig: vi.fn().mockReturnValue({ dbPath: "/tmp/test.sqlite" }),
    createDatabase: vi.fn().mockReturnValue({ close: mockDbClose }),
    Migrator: vi.fn().mockImplementation(() => ({ migrate: vi.fn() })),
    KnowledgeRepository: vi.fn().mockImplementation(() => ({
      getTopEntities: vi.fn().mockReturnValue([]),
    })),
    GraphRepository: vi.fn().mockImplementation(() => ({})),
    loadRcFile: vi.fn().mockReturnValue(null),
  };
});

vi.mock("@knowledgine/ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knowledgine/ingest")>();
  return {
    ...actual,
    IngestEngine: vi.fn().mockImplementation(() => ({
      ingest: mockIngestEngineIngest,
    })),
    isRepositoryNotFoundError: mockIsRepositoryNotFoundError,
  };
});

vi.mock("../../src/lib/plugin-loader.js", () => ({
  createDefaultRegistry: mockCreateDefaultRegistry,
  initializePlugins: mockInitializePlugins,
}));

import { ingestCommand } from "../../src/commands/ingest.js";

describe("ingest command github errors", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-ingest-github-errors-"));
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });

    const registry = {
      has: vi.fn().mockImplementation((id: string) => id === "github"),
      list: vi.fn().mockReturnValue([{ manifest: { id: "github" } }]),
    };
    mockCreateDefaultRegistry.mockReturnValue(registry);
    mockInitializePlugins.mockResolvedValue(new Map([["github", { ok: true }]]));
    mockIsRepositoryNotFoundError.mockReturnValue(true);
    mockIngestEngineIngest.mockRejectedValue(
      new Error("GraphQL: Could not resolve to a Repository with the name 'owner/repo'."),
    );
    mockDbClose.mockReset();
    process.exitCode = undefined;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it("should replace raw GitHub GraphQL errors with a friendly repository message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({
      source: "github",
      repo: "nonexistent-user-xxx/nonexistent-repo-yyy",
      path: testDir,
    });

    const messages = errorSpy.mock.calls.map((call) => call.join(" "));
    const output = messages.join("\n");

    expect(output).toContain(
      "Error: Repository 'nonexistent-user-xxx/nonexistent-repo-yyy' not found.",
    );
    expect(output).toContain("Check the repository name and ensure you have access to it on GitHub.");
    expect(output).toContain("Usage: knowledgine ingest --source github --repo owner/repo");
    expect(output).not.toContain("Could not resolve to a Repository");
    expect(output).not.toContain("Ingest failed:");
    expect(process.exitCode).toBe(1);
    expect(mockDbClose).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });
});
