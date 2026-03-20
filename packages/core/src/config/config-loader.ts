import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { parse as parseYaml } from "yaml";
import { defineConfig } from "../config.js";
import type { KnowledgineConfig } from "../config.js";

export interface RcConfig {
  semantic?: boolean;
  [key: string]: unknown;
}

/**
 * Load knowledgine configuration from RC file and environment variables.
 * Priority: env var > RC file > defaults (embedding.enabled = false)
 */
export function loadConfig(rootPath: string): KnowledgineConfig {
  const rcConfig = loadRcFile(rootPath);

  // Environment variable override
  const envSemantic = process.env["KNOWLEDGINE_SEMANTIC"];
  const semanticEnabled =
    envSemantic === "true" || envSemantic === "1" || rcConfig?.semantic === true;

  return defineConfig({
    rootPath,
    embedding: {
      modelName: "all-MiniLM-L6-v2",
      dimensions: 384,
      enabled: semanticEnabled,
    },
  });
}

function loadRcFile(rootPath: string): RcConfig | null {
  const jsonPath = resolve(rootPath, ".knowledginerc.json");
  const ymlPath = resolve(rootPath, ".knowledginerc.yml");

  try {
    if (existsSync(jsonPath)) {
      return JSON.parse(readFileSync(jsonPath, "utf-8")) as RcConfig;
    }
    if (existsSync(ymlPath)) {
      return parseYaml(readFileSync(ymlPath, "utf-8")) as RcConfig;
    }
  } catch (error) {
    console.error(
      `Warning: Failed to parse config file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return null;
}

/**
 * Write a .knowledginerc.json config file to the project root.
 */
export function writeRcConfig(rootPath: string, config: RcConfig): void {
  const rcPath = resolve(rootPath, ".knowledginerc.json");
  writeFileSync(rcPath, JSON.stringify(config, null, 2) + "\n");
}
