import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { loadConfig, writeRcConfig, resolveDefaultPath } from "../../src/config/config-loader.js";

describe("loadConfig", () => {
  let testDir: string;
  let savedSemantic: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-config-test-"));
    savedSemantic = process.env["KNOWLEDGINE_SEMANTIC"];
    delete process.env["KNOWLEDGINE_SEMANTIC"];
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    if (savedSemantic === undefined) {
      delete process.env["KNOWLEDGINE_SEMANTIC"];
    } else {
      process.env["KNOWLEDGINE_SEMANTIC"] = savedSemantic;
    }
  });

  it("should return defaults when no RC file exists", () => {
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(false);
    expect(config.embedding.modelName).toBe("all-MiniLM-L6-v2");
    expect(config.embedding.dimensions).toBe(384);
    expect(config.rootPath).toBe(testDir);
  });

  it("should load .knowledginerc.json with semantic: true", () => {
    writeFileSync(join(testDir, ".knowledginerc.json"), JSON.stringify({ semantic: true }));
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(true);
  });

  it("should load .knowledginerc.json with semantic: false", () => {
    writeFileSync(join(testDir, ".knowledginerc.json"), JSON.stringify({ semantic: false }));
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(false);
  });

  it("should load .knowledginerc.yml with semantic: true", () => {
    writeFileSync(join(testDir, ".knowledginerc.yml"), "semantic: true\n");
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(true);
  });

  it("should prefer .knowledginerc.json over .knowledginerc.yml", () => {
    writeFileSync(join(testDir, ".knowledginerc.json"), JSON.stringify({ semantic: true }));
    writeFileSync(join(testDir, ".knowledginerc.yml"), "semantic: false\n");
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(true);
  });

  it("should handle invalid JSON gracefully", () => {
    writeFileSync(join(testDir, ".knowledginerc.json"), "{ invalid json }");
    const config = loadConfig(testDir);
    // Falls back to defaults
    expect(config.embedding.enabled).toBe(false);
  });

  it("should override with KNOWLEDGINE_SEMANTIC=true env var", () => {
    process.env["KNOWLEDGINE_SEMANTIC"] = "true";
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(true);
  });

  it("should override with KNOWLEDGINE_SEMANTIC=1 env var", () => {
    process.env["KNOWLEDGINE_SEMANTIC"] = "1";
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(true);
  });

  it("should not enable semantic for KNOWLEDGINE_SEMANTIC=false", () => {
    process.env["KNOWLEDGINE_SEMANTIC"] = "false";
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(false);
  });

  it("env var should override RC file (env=true, RC=false)", () => {
    writeFileSync(join(testDir, ".knowledginerc.json"), JSON.stringify({ semantic: false }));
    process.env["KNOWLEDGINE_SEMANTIC"] = "true";
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(true);
  });

  it("should ignore unknown keys in RC file", () => {
    writeFileSync(
      join(testDir, ".knowledginerc.json"),
      JSON.stringify({ semantic: true, unknownKey: "value", anotherKey: 42 }),
    );
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(true);
    // Should not throw and should still return valid config
    expect(config.rootPath).toBe(testDir);
  });
});

describe("resolveDefaultPath", () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["KNOWLEDGINE_PATH"];
  });

  afterEach(() => {
    process.env = originalEnv;
    process.cwd = originalCwd;
  });

  it("returns resolved cliPath when provided", () => {
    const result = resolveDefaultPath("/some/path");
    expect(result).toBe(resolve("/some/path"));
  });

  it("returns resolved relative cliPath when provided", () => {
    const result = resolveDefaultPath("./relative/path");
    expect(result).toBe(resolve("./relative/path"));
  });

  it("uses KNOWLEDGINE_PATH env var when no cliPath", () => {
    process.env["KNOWLEDGINE_PATH"] = "/env/path";
    const result = resolveDefaultPath();
    expect(result).toBe(resolve("/env/path"));
  });

  it("CLI arg takes priority over env var", () => {
    process.env["KNOWLEDGINE_PATH"] = "/env/path";
    const result = resolveDefaultPath("/cli/path");
    expect(result).toBe(resolve("/cli/path"));
  });

  it("falls back to cwd when no config or env", () => {
    // Use a temp dir as cwd to avoid reading the project's .knowledginerc.json
    const tempCwd = mkdtempSync(join(tmpdir(), "knowledgine-cwd-test-"));
    process.cwd = () => tempCwd;
    try {
      const result = resolveDefaultPath();
      expect(result).toBe(resolve(tempCwd));
    } finally {
      process.cwd = originalCwd;
      rmSync(tempCwd, { recursive: true, force: true });
    }
  });

  it("handles undefined cliPath", () => {
    const tempCwd = mkdtempSync(join(tmpdir(), "knowledgine-cwd-test-"));
    process.cwd = () => tempCwd;
    try {
      const result = resolveDefaultPath(undefined);
      expect(result).toBe(resolve(tempCwd));
    } finally {
      process.cwd = originalCwd;
      rmSync(tempCwd, { recursive: true, force: true });
    }
  });
});

describe("loadConfig: hierarchical RC file search", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "knowledgine-hierarchy-test-"));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it("should find .knowledginerc.json in a parent directory", () => {
    // 親ディレクトリに設定ファイルを置く
    writeFileSync(join(rootDir, ".knowledginerc.json"), JSON.stringify({ semantic: true }));
    // 子ディレクトリから loadConfig を呼ぶ
    const childDir = join(rootDir, "child");
    mkdirSync(childDir, { recursive: true });
    const config = loadConfig(childDir);
    expect(config.embedding.enabled).toBe(true);
  });

  it("should not traverse more than 5 levels up", () => {
    // 6階層上に設定ファイルを置く（探索範囲外）
    writeFileSync(join(rootDir, ".knowledginerc.json"), JSON.stringify({ semantic: true }));
    // 6階層深い子ディレクトリを作成
    const deepDir = join(rootDir, "a", "b", "c", "d", "e", "f");
    mkdirSync(deepDir, { recursive: true });
    const config = loadConfig(deepDir);
    // 6階層上は探索しないのでデフォルト値になる
    expect(config.embedding.enabled).toBe(false);
  });

  it("should use the nearest .knowledginerc.json when multiple exist", () => {
    // 親ディレクトリに semantic: false
    writeFileSync(join(rootDir, ".knowledginerc.json"), JSON.stringify({ semantic: false }));
    // 子ディレクトリに semantic: true（より近い）
    const childDir = join(rootDir, "child");
    mkdirSync(childDir, { recursive: true });
    writeFileSync(join(childDir, ".knowledginerc.json"), JSON.stringify({ semantic: true }));
    // 孫ディレクトリから探索 → 子の設定が使われるべき
    const grandChildDir = join(childDir, "grandchild");
    mkdirSync(grandChildDir, { recursive: true });
    const config = loadConfig(grandChildDir);
    expect(config.embedding.enabled).toBe(true);
  });
});

describe("writeRcConfig", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-config-write-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should write .knowledginerc.json", () => {
    writeRcConfig(testDir, { semantic: true });
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(true);
  });

  it("should overwrite existing .knowledginerc.json", () => {
    writeRcConfig(testDir, { semantic: true });
    writeRcConfig(testDir, { semantic: false });
    const config = loadConfig(testDir);
    expect(config.embedding.enabled).toBe(false);
  });
});
