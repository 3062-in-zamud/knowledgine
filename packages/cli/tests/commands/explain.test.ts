import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { createDatabase, Migrator, ALL_MIGRATIONS } from "@knowledgine/core";
import { registerExplainCommand } from "../../src/commands/explain.js";
import { Command } from "commander";

// KnowledgeService と ProvenanceRepository をモック
vi.mock("@knowledgine/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@knowledgine/core")>();
  return {
    ...original,
    KnowledgeService: vi.fn(),
    ProvenanceRepository: vi.fn(),
  };
});

import { KnowledgeService, ProvenanceRepository } from "@knowledgine/core";
const MockedKnowledgeService = vi.mocked(KnowledgeService);
const MockedProvenanceRepository = vi.mocked(ProvenanceRepository);

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit in tests
  registerExplainCommand(program);
  return program;
}

describe("explain command", () => {
  let testDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let mockGetEntityGraph: ReturnType<typeof vi.fn>;
  let mockFindRelated: ReturnType<typeof vi.fn>;
  let mockSearchEntities: ReturnType<typeof vi.fn>;
  let mockGetByEntityUri: ReturnType<typeof vi.fn>;

  const sampleEntityGraph = {
    id: 1,
    name: "TypeScript",
    entityType: "technology",
    description: "A typed superset of JavaScript",
    createdAt: "2026-03-15T00:00:00Z",
    observations: [
      {
        id: 1,
        entityId: 1,
        content: "TypeScript is widely used",
        observationType: "fact",
        createdAt: "2026-03-15T00:00:00Z",
      },
      {
        id: 2,
        entityId: 1,
        content: "TypeScript adds static types",
        observationType: "fact",
        createdAt: "2026-03-15T00:00:00Z",
      },
    ],
    outgoingRelations: [
      {
        id: 1,
        fromEntityId: 1,
        toEntityId: 2,
        relationType: "related_to",
        createdAt: "2026-03-21T00:00:00Z",
        targetEntity: {
          id: 2,
          name: "JavaScript",
          entityType: "technology",
          createdAt: "2026-03-15T00:00:00Z",
        },
      },
    ],
    incomingRelations: [],
    linkedNotes: [
      { entityId: 1, noteId: 101, note: { title: "TS config guide" } },
      { entityId: 1, noteId: 102, note: { title: "TS best practices" } },
    ],
  };

  const sampleProvenance = [
    {
      id: "prov-1",
      entityUri: "entity://TypeScript",
      activityType: "ingest",
      agent: "git-history",
      sourceUri: "git://commit/abc123",
      generatedAt: "2026-03-15T00:00:00Z",
      metadata: { message: "First appearance" },
    },
    {
      id: "prov-2",
      entityUri: "entity://TypeScript",
      activityType: "extract",
      agent: "entity-extractor",
      sourceUri: "github://owner/repo/issues/42",
      generatedAt: "2026-03-18T00:00:00Z",
      metadata: { message: "Type assigned" },
    },
    {
      id: "prov-3",
      entityUri: "entity://TypeScript",
      activityType: "link",
      agent: "relation-inferrer",
      sourceUri: "knowledge/typescript/patterns.md",
      generatedAt: "2026-03-21T00:00:00Z",
      metadata: { message: "Connected to JavaScript" },
    },
  ];

  const sampleFindRelatedResult = {
    noteId: 42,
    relatedNotes: [
      {
        noteId: 101,
        filePath: "ts-config.md",
        title: "TS config guide",
        score: 0.85,
        reasons: ["shared entity: TypeScript"],
      },
    ],
    problemSolutionPairs: [
      {
        id: 1,
        problemNoteId: 42,
        solutionNoteId: 101,
        problemPattern: "TS2345 null assignment error",
        solutionPattern: "Use type guard for null safety",
        confidence: 0.92,
      },
    ],
    graphRelations: [
      {
        entityId: 1,
        name: "TypeScript",
        entityType: "technology",
        relatedEntities: [{ id: 2, name: "JavaScript", entityType: "technology", hops: 1 }],
      },
    ],
  };

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-explain-test-${randomUUID()}`);
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });

    // Create minimal sqlite db
    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();

    // Write a minimal config
    writeFileSync(
      join(testDir, ".knowledgine", "config.json"),
      JSON.stringify({ dbPath: join(testDir, ".knowledgine", "index.sqlite") }),
    );

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockGetEntityGraph = vi.fn().mockReturnValue(sampleEntityGraph);
    mockFindRelated = vi.fn().mockResolvedValue(sampleFindRelatedResult);
    mockSearchEntities = vi.fn().mockReturnValue({
      query: "TypeScript",
      totalResults: 1,
      entities: [
        {
          id: 1,
          name: "TypeScript",
          entityType: "technology",
          description: "A typed superset of JavaScript",
          createdAt: "2026-03-15T00:00:00Z",
        },
      ],
    });
    mockGetByEntityUri = vi.fn().mockReturnValue(sampleProvenance);

    MockedKnowledgeService.mockImplementation(
      () =>
        ({
          getEntityGraph: mockGetEntityGraph,
          findRelated: mockFindRelated,
          searchEntities: mockSearchEntities,
        }) as unknown as InstanceType<typeof KnowledgeService>,
    );

    MockedProvenanceRepository.mockImplementation(
      () =>
        ({
          getByEntityUri: mockGetByEntityUri,
        }) as unknown as InstanceType<typeof ProvenanceRepository>,
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  describe("--entity option", () => {
    it("should call getEntityGraph with entityName (sync, no await)", async () => {
      const program = makeProgram();
      await program.parseAsync(["explain", "--entity", "TypeScript", "--path", testDir], {
        from: "user",
      });

      expect(mockGetEntityGraph).toHaveBeenCalledWith({ entityName: "TypeScript" });
      // findRelated は呼ばれない
      expect(mockFindRelated).not.toHaveBeenCalled();
    });

    it("should output plain format with entity info by default", async () => {
      const program = makeProgram();
      await program.parseAsync(["explain", "--entity", "TypeScript", "--path", testDir], {
        from: "user",
      });

      const allOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join("\n");

      expect(allOutput).toContain("TypeScript");
      expect(allOutput).toContain("technology");
    });

    it("should output JSON format with --format json", async () => {
      const program = makeProgram();
      await program.parseAsync(
        ["explain", "--entity", "TypeScript", "--format", "json", "--path", testDir],
        { from: "user" },
      );

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as { entity: unknown; graph: unknown; provenance: unknown };
      expect(parsed.entity).toBeDefined();
      expect(parsed.graph).toBeDefined();
      expect(parsed.provenance).toBeDefined();
    });

    it("should show entity not found message when getEntityGraph returns undefined", async () => {
      mockGetEntityGraph.mockReturnValue(undefined);

      const program = makeProgram();
      await program.parseAsync(["explain", "--entity", "UnknownEntity", "--path", testDir], {
        from: "user",
      });

      const allOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join("\n");

      expect(allOutput).toContain("UnknownEntity");
      expect(allOutput).toContain("not found");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("--note-id option", () => {
    it("should call findRelated with noteId (async)", async () => {
      const program = makeProgram();
      await program.parseAsync(["explain", "--note-id", "42", "--path", testDir], {
        from: "user",
      });

      expect(mockFindRelated).toHaveBeenCalledWith(expect.objectContaining({ noteId: 42 }));
      // getEntityGraph は直接呼ばれない（findRelated 内で解決される）
    });

    it("should output plain format for note explain", async () => {
      const program = makeProgram();
      await program.parseAsync(["explain", "--note-id", "42", "--path", testDir], {
        from: "user",
      });

      const allOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join("\n");

      expect(allOutput).toContain("42");
    });
  });

  describe("[query] argument", () => {
    it("should call searchEntities with query (sync, no await)", async () => {
      const program = makeProgram();
      await program.parseAsync(["explain", "TypeScript", "--path", testDir], { from: "user" });

      expect(mockSearchEntities).toHaveBeenCalledWith(
        expect.objectContaining({ query: "TypeScript" }),
      );
    });

    it("should use first search result to call getEntityGraph", async () => {
      const program = makeProgram();
      await program.parseAsync(["explain", "TypeScript", "--path", testDir], { from: "user" });

      expect(mockGetEntityGraph).toHaveBeenCalledWith({ entityName: "TypeScript" });
    });

    it("should show not found when searchEntities returns empty", async () => {
      mockSearchEntities.mockReturnValue({
        query: "unknown",
        totalResults: 0,
        entities: [],
      });

      const program = makeProgram();
      await program.parseAsync(["explain", "unknown", "--path", testDir], { from: "user" });

      const allOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join("\n");

      expect(allOutput).toContain("not found");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("--timeline option", () => {
    it("should show chronological timeline output", async () => {
      const program = makeProgram();
      await program.parseAsync(
        ["explain", "--entity", "TypeScript", "--timeline", "--path", testDir],
        { from: "user" },
      );

      const allOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join("\n");

      expect(allOutput).toContain("Timeline");
      expect(allOutput).toContain("TypeScript");
    });

    it("should sort provenance by generatedAt chronologically", async () => {
      // Provenance を逆順で返すモック
      const reversedProvenance = [...sampleProvenance].reverse();
      mockGetByEntityUri.mockReturnValue(reversedProvenance);

      const program = makeProgram();
      await program.parseAsync(
        ["explain", "--entity", "TypeScript", "--timeline", "--path", testDir],
        { from: "user" },
      );

      const allOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join("\n");

      // 時系列ソートされているので 2026-03-15 が 2026-03-21 より前に来る
      const idx15 = allOutput.indexOf("2026-03-15");
      const idx21 = allOutput.indexOf("2026-03-21");
      expect(idx15).toBeGreaterThanOrEqual(0);
      expect(idx21).toBeGreaterThanOrEqual(0);
      expect(idx15).toBeLessThan(idx21);
    });
  });

  describe("provenance graceful degradation", () => {
    it("should still show entity info when provenance is empty", async () => {
      mockGetByEntityUri.mockReturnValue([]);

      const program = makeProgram();
      await program.parseAsync(["explain", "--entity", "TypeScript", "--path", testDir], {
        from: "user",
      });

      const allOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join("\n");

      expect(allOutput).toContain("TypeScript");
      // エラーにならない
      expect(process.exitCode).not.toBe(1);
    });
  });

  describe("error handling", () => {
    it("should error when not initialized", async () => {
      rmSync(join(testDir, ".knowledgine"), { recursive: true, force: true });

      const program = makeProgram();
      await program.parseAsync(["explain", "--entity", "TypeScript", "--path", testDir], {
        from: "user",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not initialized"));
      expect(process.exitCode).toBe(1);
    });

    it("should show help message when no arguments or options provided", async () => {
      const program = makeProgram();
      await program.parseAsync(["explain", "--path", testDir], { from: "user" });

      const allOutput = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
      ].join("\n");

      expect(allOutput).toContain("query");
      expect(process.exitCode).toBe(1);
    });

    it("should error on invalid format", async () => {
      const program = makeProgram();
      await program.parseAsync(
        ["explain", "--entity", "TypeScript", "--format", "csv", "--path", testDir],
        { from: "user" },
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("--format must be one of"),
      );
      expect(process.exitCode).toBe(1);
    });
  });
});
