import { readFileSync } from "fs";
import { resolve } from "path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { defineConfig } from "../config.js";
import type { KnowledgineConfig } from "../config.js";
import { writeTextFileAtomically } from "../utils/atomic-write.js";
import { DEFAULT_MODEL_NAME, MODEL_REGISTRY } from "../embedding/model-manager.js";

export interface RcConfig {
  semantic?: boolean;
  defaultPath?: string;
  /** This project's identifier — read by VisibilityGate to gate cross-project access. */
  selfName?: string;
  plugins?: { enabled?: string[]; [pluginId: string]: unknown };
  search?: { defaultMode?: "keyword" | "semantic" | "hybrid"; defaultLimit?: number };
  serve?: { defaultPort?: number; host?: string; authToken?: string };
  llm?: import("../llm/types.js").LLMConfig;
  noise?: {
    shortMessageThreshold?: number;
    botAuthors?: string[];
    noiseSubjectPatterns?: string[];
    excludePatterns?: string[];
  };
  observer?: { enabled?: boolean; limit?: number };
  projects?: Array<{
    name: string;
    path: string;
    /** "public" (default) or "private". Private projects are gated by VisibilityGate. */
    visibility?: "private" | "public";
    /** Caller `selfName`s allowed to read or transfer-from this project when private. */
    allowFrom?: string[];
  }>;
  [key: string]: unknown;
}

const rcConfigSchema = z
  .object({
    semantic: z.boolean().optional(),
    defaultPath: z.string().optional(),
    selfName: z.string().optional(),
    plugins: z
      .object({
        enabled: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    search: z
      .object({
        defaultMode: z.enum(["keyword", "semantic", "hybrid"]).optional(),
        defaultLimit: z.number().int().positive().optional(),
      })
      .optional(),
    serve: z
      .object({
        defaultPort: z.number().int().positive().optional(),
        host: z.string().optional(),
        authToken: z.string().optional(),
      })
      .optional(),
    noise: z
      .object({
        shortMessageThreshold: z.number().int().positive().optional(),
        botAuthors: z.array(z.string()).optional(),
        noiseSubjectPatterns: z.array(z.string()).optional(),
        excludePatterns: z.array(z.string()).optional(),
      })
      .optional(),
    observer: z
      .object({
        enabled: z.boolean().optional(),
        limit: z.number().int().positive().optional(),
      })
      .optional(),
    projects: z
      .array(
        z.object({
          name: z.string(),
          path: z.string(),
          visibility: z.enum(["private", "public"]).optional(),
          allowFrom: z.array(z.string()).optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

function hasErrnoCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code
  );
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

  const modelConfig = MODEL_REGISTRY[DEFAULT_MODEL_NAME];
  return defineConfig({
    rootPath,
    embedding: {
      modelName: DEFAULT_MODEL_NAME,
      dimensions: modelConfig?.dimensions ?? 384,
      enabled: semanticEnabled,
    },
  });
}

const rcConfigSchemaTyped = rcConfigSchema as z.ZodType<RcConfig>;

function validateRcConfig(raw: unknown, filePath: string): RcConfig | null {
  const result = rcConfigSchemaTyped.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  console.warn(
    `Warning: Invalid config in ${filePath}, falling back to defaults: ${result.error.message}`,
  );
  return null;
}

export function loadRcFile(startDir: string): RcConfig | null {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const jsonPath = resolve(dir, ".knowledginerc.json");
    const ymlPath = resolve(dir, ".knowledginerc.yml");
    try {
      try {
        const raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
        return validateRcConfig(raw, jsonPath);
      } catch (error) {
        if (!hasErrnoCode(error, "ENOENT")) {
          throw error;
        }
      }

      try {
        const raw = parseYaml(readFileSync(ymlPath, "utf-8"));
        return validateRcConfig(raw, ymlPath);
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
