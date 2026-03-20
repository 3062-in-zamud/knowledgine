import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  resolveConfig,
  initializeDependencies,
  formatToolResult,
  formatToolError,
} from "../src/helpers.js";
import { KnowledgeRepository } from "@knowledgine/core";

describe("resolveConfig", () => {
  let savedDbPath: string | undefined;
  let savedRootPath: string | undefined;

  beforeEach(() => {
    savedDbPath = process.env["KNOWLEDGINE_DB_PATH"];
    savedRootPath = process.env["KNOWLEDGINE_ROOT_PATH"];
    delete process.env["KNOWLEDGINE_DB_PATH"];
    delete process.env["KNOWLEDGINE_ROOT_PATH"];
  });

  afterEach(() => {
    if (savedDbPath === undefined) {
      delete process.env["KNOWLEDGINE_DB_PATH"];
    } else {
      process.env["KNOWLEDGINE_DB_PATH"] = savedDbPath;
    }
    if (savedRootPath === undefined) {
      delete process.env["KNOWLEDGINE_ROOT_PATH"];
    } else {
      process.env["KNOWLEDGINE_ROOT_PATH"] = savedRootPath;
    }
  });

  it("no env vars → rootPath defaults to cwd", () => {
    const config = resolveConfig();
    expect(config.rootPath).toBe(process.cwd());
  });

  it("no env vars → dbPath auto-calculated from rootPath", () => {
    const config = resolveConfig();
    expect(config.dbPath).toBe(resolve(process.cwd(), ".knowledgine", "index.sqlite"));
  });

  it("KNOWLEDGINE_DB_PATH set → uses specified dbPath", () => {
    process.env["KNOWLEDGINE_DB_PATH"] = "/custom/path/db.sqlite";
    const config = resolveConfig();
    expect(config.dbPath).toBe("/custom/path/db.sqlite");
  });

  it("KNOWLEDGINE_ROOT_PATH set → uses specified rootPath", () => {
    process.env["KNOWLEDGINE_ROOT_PATH"] = "/custom/root";
    const config = resolveConfig();
    expect(config.rootPath).toBe("/custom/root");
  });

  it("KNOWLEDGINE_ROOT_PATH set → dbPath derived from rootPath", () => {
    process.env["KNOWLEDGINE_ROOT_PATH"] = "/custom/root";
    const config = resolveConfig();
    expect(config.dbPath).toBe(resolve("/custom/root", ".knowledgine", "index.sqlite"));
  });
});

describe("formatToolResult", () => {
  it("returns correct structure with data", () => {
    const data = { key: "value", count: 42 };
    const result = formatToolResult(data);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
  });

  it("returns correct structure with empty object", () => {
    const result = formatToolResult({});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("{}");
  });

  it("returns correct structure with nested data", () => {
    const data = { nested: { deep: { value: [1, 2, 3] } } };
    const result = formatToolResult(data);
    expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
  });
});

describe("formatToolError", () => {
  it("returns correct structure with isError:true", () => {
    const result = formatToolError("Something went wrong");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("Something went wrong");
    expect(result.isError).toBe(true);
  });

  it("includes the error message in content", () => {
    const message = "Database connection failed";
    const result = formatToolError(message);
    expect(result.content[0].text).toBe(message);
  });
});

describe("initializeDependencies", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "knowledgine-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates DB + runs migrations + returns KnowledgeRepository", () => {
    const dbPath = join(tmpDir, "test.sqlite");
    const config = {
      rootPath: tmpDir,
      dbPath,
      patterns: { enabled: ["problem", "solution", "learning", "time"] as const },
      frontmatter: { requiredFields: [] },
      embedding: { enabled: false, modelName: "all-MiniLM-L6-v2", dimensions: 384 },
      search: { defaultMode: "keyword" as const, hybridAlpha: 0.3 },
    };

    const { repository } = initializeDependencies(config);
    expect(repository).toBeInstanceOf(KnowledgeRepository);
  });

  it("returned repository can save and retrieve notes", () => {
    const dbPath = join(tmpDir, "test2.sqlite");
    const config = {
      rootPath: tmpDir,
      dbPath,
      patterns: { enabled: ["problem", "solution", "learning", "time"] as const },
      frontmatter: { requiredFields: [] },
      embedding: { enabled: false, modelName: "all-MiniLM-L6-v2", dimensions: 384 },
      search: { defaultMode: "keyword" as const, hybridAlpha: 0.3 },
    };

    const { repository } = initializeDependencies(config);
    const noteId = repository.saveNote({
      filePath: "test.md",
      title: "Test",
      content: "content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    expect(noteId).toBeGreaterThan(0);
  });
});
