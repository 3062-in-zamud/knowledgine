import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCategoryHints } from "../../src/commands/ingest.js";

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

describe("buildCategoryHints", () => {
  it("returns network hint when network errors present", () => {
    const hints = buildCategoryHints({ network: 2 });
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("network errors");
    expect(hints[0]).toContain("internet connection");
  });

  it("returns parse hint when parse errors present", () => {
    const hints = buildCategoryHints({ parse: 1 });
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("parse errors");
    expect(hints[0]).toContain("malformed");
  });

  it("returns rate_limit hint when rate_limit errors present", () => {
    const hints = buildCategoryHints({ rate_limit: 3 });
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("rate_limit errors");
    expect(hints[0]).toContain("rate-limited");
  });

  it("returns permission hint when permission errors present", () => {
    const hints = buildCategoryHints({ permission: 1 });
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("permission errors");
    expect(hints[0]).toContain("permissions");
  });

  it("returns no hint for unknown-only errors", () => {
    const hints = buildCategoryHints({ unknown: 5 });
    expect(hints).toHaveLength(0);
  });

  it("returns multiple hints when multiple categories present", () => {
    const hints = buildCategoryHints({ network: 1, parse: 2, permission: 1 });
    expect(hints).toHaveLength(3);
    const text = hints.join("\n");
    expect(text).toContain("network errors");
    expect(text).toContain("parse errors");
    expect(text).toContain("permission errors");
  });

  it("returns empty array for empty counts", () => {
    const hints = buildCategoryHints({});
    expect(hints).toHaveLength(0);
  });
});

describe("ingest --all error details display", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-ingest-error-details-"));
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });

    mockIsRepositoryNotFoundError.mockReturnValue(false);
    mockDbClose.mockReset();
    process.exitCode = undefined;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it("shows error details from all plugins in --all mode", async () => {
    const filePlugin = {
      manifest: { id: "markdown", schemes: ["file://"] },
    };
    const gitPlugin = {
      manifest: { id: "git-history", schemes: ["git://"] },
    };
    const registry = {
      has: vi.fn().mockReturnValue(true),
      list: vi.fn().mockReturnValue([filePlugin, gitPlugin]),
    };
    mockCreateDefaultRegistry.mockReturnValue(registry);
    mockInitializePlugins.mockResolvedValue(
      new Map([
        ["markdown", { ok: true }],
        ["git-history", { ok: true }],
      ]),
    );

    // markdown plugin returns 2 errors with details
    // git-history plugin returns 1 error with details
    mockIngestEngineIngest
      .mockResolvedValueOnce({
        processed: 5,
        errors: 2,
        deleted: 0,
        skipped: 0,
        elapsedMs: 100,
        errorDetails: [
          { category: "parse", sourceUri: "file://a.md", message: "invalid frontmatter" },
          { category: "parse", sourceUri: "file://b.md", message: "encoding error" },
        ],
      })
      .mockResolvedValueOnce({
        processed: 3,
        errors: 1,
        deleted: 0,
        skipped: 0,
        elapsedMs: 50,
        errorDetails: [
          { category: "permission", sourceUri: "git://repo#abc123", message: "access denied" },
        ],
      });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ all: true, path: testDir });

    const output = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");

    // Should show error details with category, sourceUri, and message
    expect(output).toContain("[parse] file://a.md — invalid frontmatter");
    expect(output).toContain("[parse] file://b.md — encoding error");
    expect(output).toContain("[permission] git://repo#abc123 — access denied");

    // Should show category breakdown
    expect(output).toContain("parse: 2");
    expect(output).toContain("permission: 1");

    // Should show action hints
    expect(output).toContain("parse errors:");
    expect(output).toContain("permission errors:");

    errorSpy.mockRestore();
  });

  it("shows only 10 error details by default in --all mode (truncated)", async () => {
    const plugin = { manifest: { id: "markdown", schemes: ["file://"] } };
    const registry = {
      has: vi.fn().mockReturnValue(true),
      list: vi.fn().mockReturnValue([plugin]),
    };
    mockCreateDefaultRegistry.mockReturnValue(registry);
    mockInitializePlugins.mockResolvedValue(new Map([["markdown", { ok: true }]]));

    // 15 errors
    const errorDetails = Array.from({ length: 15 }, (_, i) => ({
      category: "network",
      sourceUri: `file://doc${i}.md`,
      message: `connection refused (${i})`,
    }));
    mockIngestEngineIngest.mockResolvedValueOnce({
      processed: 0,
      errors: 15,
      deleted: 0,
      skipped: 0,
      elapsedMs: 100,
      errorDetails,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ all: true, path: testDir });

    const output = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");

    // First 10 shown
    expect(output).toContain("file://doc0.md");
    expect(output).toContain("file://doc9.md");
    // 11th not shown by default
    expect(output).not.toContain("file://doc10.md");
    // truncation message
    expect(output).toContain("... and 5 more (use --verbose to see all)");

    errorSpy.mockRestore();
  });

  it("shows all error details with --verbose in --all mode", async () => {
    const plugin = { manifest: { id: "markdown", schemes: ["file://"] } };
    const registry = {
      has: vi.fn().mockReturnValue(true),
      list: vi.fn().mockReturnValue([plugin]),
    };
    mockCreateDefaultRegistry.mockReturnValue(registry);
    mockInitializePlugins.mockResolvedValue(new Map([["markdown", { ok: true }]]));

    const errorDetails = Array.from({ length: 12 }, (_, i) => ({
      category: "network",
      sourceUri: `file://doc${i}.md`,
      message: `timeout (${i})`,
    }));
    mockIngestEngineIngest.mockResolvedValueOnce({
      processed: 0,
      errors: 12,
      deleted: 0,
      skipped: 0,
      elapsedMs: 100,
      errorDetails,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ all: true, path: testDir, verbose: true });

    const output = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");

    // All 12 shown
    expect(output).toContain("file://doc11.md");
    // No truncation message
    expect(output).not.toContain("... and");

    errorSpy.mockRestore();
  });

  it("shows no error block when there are no errors in --all mode", async () => {
    const plugin = { manifest: { id: "markdown", schemes: ["file://"] } };
    const registry = {
      has: vi.fn().mockReturnValue(true),
      list: vi.fn().mockReturnValue([plugin]),
    };
    mockCreateDefaultRegistry.mockReturnValue(registry);
    mockInitializePlugins.mockResolvedValue(new Map([["markdown", { ok: true }]]));

    mockIngestEngineIngest.mockResolvedValueOnce({
      processed: 5,
      errors: 0,
      deleted: 0,
      skipped: 0,
      elapsedMs: 100,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ all: true, path: testDir });

    const output = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(output).not.toContain("error(s) during ingest");
    expect(output).not.toContain("Categories:");

    errorSpy.mockRestore();
  });
});

describe("ingest single-source error details display", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-ingest-single-errors-"));
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });

    mockIsRepositoryNotFoundError.mockReturnValue(false);
    mockDbClose.mockReset();
    process.exitCode = undefined;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it("shows category breakdown always (not verbose-only) in single-source mode", async () => {
    const registry = {
      has: vi.fn().mockReturnValue(true),
      list: vi.fn().mockReturnValue([{ manifest: { id: "markdown", schemes: ["file://"] } }]),
    };
    mockCreateDefaultRegistry.mockReturnValue(registry);
    mockInitializePlugins.mockResolvedValue(new Map([["markdown", { ok: true }]]));

    mockIngestEngineIngest.mockResolvedValueOnce({
      processed: 2,
      errors: 2,
      deleted: 0,
      skipped: 0,
      elapsedMs: 100,
      errorDetails: [
        { category: "network", sourceUri: "file://a.md", message: "timeout" },
        { category: "parse", sourceUri: "file://b.md", message: "bad syntax" },
      ],
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Without --verbose
    await ingestCommand({ source: "markdown", path: testDir });

    const output = errorSpy.mock.calls.map((call) => call.join(" ")).join("\n");

    // Category breakdown should appear even without --verbose
    expect(output).toContain("Categories:");
    expect(output).toContain("network: 1");
    expect(output).toContain("parse: 1");

    // Action hints should appear
    expect(output).toContain("network errors:");
    expect(output).toContain("parse errors:");

    errorSpy.mockRestore();
  });
});
