import { resolve } from "path";

export type PatternCategory = "problem" | "solution" | "learning" | "time";

export interface EmbeddingConfig {
  /** 使用するモデル名 */
  modelName: string;
  /** 埋め込み次元数 */
  dimensions: number;
  /** 埋め込み生成を有効にするか */
  enabled: boolean;
}

export interface SearchConfig {
  /** デフォルト検索モード */
  defaultMode: "keyword" | "semantic" | "hybrid";
  /** ハイブリッド検索のFTSスコア重み (0-1) */
  hybridAlpha: number;
}

export interface KnowledgineConfig {
  rootPath: string;
  dbPath: string;
  patterns: {
    enabled: PatternCategory[];
  };
  frontmatter: {
    requiredFields: string[];
  };
  embedding: EmbeddingConfig;
  search: SearchConfig;
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
  embedding: {
    modelName: "all-MiniLM-L6-v2",
    dimensions: 384,
    enabled: true,
  },
  search: {
    defaultMode: "keyword",
    hybridAlpha: 0.3,
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
    embedding: {
      ...DEFAULT_CONFIG.embedding,
      ...partial.embedding,
    },
    search: {
      ...DEFAULT_CONFIG.search,
      ...partial.search,
    },
  };
}
