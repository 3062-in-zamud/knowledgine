import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig, writeRcConfig } from "../../src/config/config-loader.js";

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
