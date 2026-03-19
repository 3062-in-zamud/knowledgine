import { resolve } from "path";

export type PatternCategory = "problem" | "solution" | "learning" | "time";

export interface KnowledgineConfig {
  rootPath: string;
  dbPath: string;
  patterns: {
    enabled: PatternCategory[];
  };
  frontmatter: {
    requiredFields: string[];
  };
}

const DEFAULT_CONFIG: KnowledgineConfig = {
  rootPath: ".",
  dbPath: "",
  patterns: {
    enabled: ["problem", "solution", "learning", "time"],
  },
  frontmatter: {
    requiredFields: [],
  },
};

export function defineConfig(partial: Partial<KnowledgineConfig> = {}): KnowledgineConfig {
  const rootPath = partial.rootPath ?? DEFAULT_CONFIG.rootPath;
  const dbPath = partial.dbPath || resolve(rootPath, ".knowledgine", "index.sqlite");

  return {
    ...DEFAULT_CONFIG,
    ...partial,
    rootPath,
    dbPath,
    patterns: {
      ...DEFAULT_CONFIG.patterns,
      ...partial.patterns,
    },
    frontmatter: {
      ...DEFAULT_CONFIG.frontmatter,
      ...partial.frontmatter,
    },
  };
}
