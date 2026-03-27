import { readFileSync } from "fs";
import { resolve } from "path";
import { parse as parseYaml } from "yaml";
import { defineConfig } from "../config.js";
import type { KnowledgineConfig } from "../config.js";
import { writeTextFileAtomically } from "../utils/atomic-write.js";

export interface RcConfig {
  semantic?: boolean;
  defaultPath?: string;
  plugins?: { enabled?: string[]; [pluginId: string]: unknown };
  search?: { defaultMode?: "keyword" | "semantic" | "hybrid"; defaultLimit?: number };
  serve?: { defaultPort?: number; host?: string };
  llm?: import("../llm/types.js").LLMConfig;
  [key: string]: unknown;
}

function hasErrnoCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
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

function loadRcFile(startDir: string): RcConfig | null {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const jsonPath = resolve(dir, ".knowledginerc.json");
    const ymlPath = resolve(dir, ".knowledginerc.yml");
    try {
      try {
        return JSON.parse(readFileSync(jsonPath, "utf-8")) as RcConfig;
      } catch (error) {
        if (!hasErrnoCode(error, "ENOENT")) {
          throw error;
        }
      }

      try {
        return parseYaml(readFileSync(ymlPath, "utf-8")) as RcConfig;
      } catch (error) {
        if (!hasErrnoCode(error, "ENOENT")) {
          throw error;
        }
      }
    } catch (error) {
      console.error(
        `Warning: Failed to parse config file: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break; // ルートに到達
    dir = parent;
  }
  return null;
}

/**
 * Resolve the default root path.
 * Priority: cliPath > KNOWLEDGINE_PATH env > cwd/.knowledginerc.json defaultPath > cwd
 */
export function resolveDefaultPath(cliPath?: string): string {
  if (cliPath) return resolve(cliPath);

  const envPath = process.env["KNOWLEDGINE_PATH"];
  if (envPath) return resolve(envPath);

  // Read from cwd's .knowledginerc.json (NOT rootPath's — avoids circular dependency)
  const rcConfig = loadRcFile(process.cwd());
  if (rcConfig?.defaultPath) return resolve(rcConfig.defaultPath);

  return resolve(process.cwd());
}

/**
 * Write a .knowledginerc.json config file to the specified directory.
 * Merges with existing config if present.
 */
export function writeRcConfig(dirPath: string, config: RcConfig): void {
  const rcPath = resolve(dirPath, ".knowledginerc.json");
  let existing: RcConfig = {};
  try {
    existing = JSON.parse(readFileSync(rcPath, "utf-8")) as RcConfig;
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) {
      existing = {};
    }
    // If existing file is invalid, overwrite it
  }
  const merged = { ...existing, ...config };
  writeTextFileAtomically(rcPath, JSON.stringify(merged, null, 2) + "\n");
}
