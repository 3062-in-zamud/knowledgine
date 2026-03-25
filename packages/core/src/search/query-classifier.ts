export type QueryType = "factual" | "temporal" | "exploratory" | "procedural";

export interface QueryWeights {
  vector: number;
  graph: number;
  agentic: number;
}

// 時間表現のパターン
const TEMPORAL_PATTERNS = [
  /先週|昨日|今日|今週|先月|今月|最近|直近/,
  /\d{4}[-/]\d{1,2}[-/]\d{1,2}/, // YYYY-MM-DD or YYYY/MM/DD
  /\d+月|\d+年/,
  /before|after|ago|yesterday|last\s+week|last\s+month|recently/i,
];

// 手順・方法のパターン
const PROCEDURAL_PATTERNS = [
  /手順|方法|やり方|やりかた|設定方法|デプロイ手順|インストール手順/,
  /how\s+to|steps?|procedure|tutorial|guide|setup|configure|install/i,
];

// 事実・固有名詞のパターン
const FACTUAL_PATTERNS = [
  /とは|って何|というのは|定義/,
  /v\d+\.\d+(\.\d+)?/, // バージョン番号 v1.2.3
  /\d+\.\d+(\.\d+)?/, // バージョン番号 1.2.3
  /what\s+is|what's|definition|version|release/i,
  /[A-Z][a-z]+[A-Z][a-zA-Z]+/, // キャメルケース固有名詞 (TypeScript, ReactHooks等)
];

/**
 * クエリ文字列を分析してクエリタイプを判定する。
 * 優先順位: temporal > procedural > factual > exploratory
 */
export function classifyQuery(query: string): QueryType {
  if (!query || query.trim() === "") {
    return "exploratory";
  }

  // temporal: 時間表現が含まれているか
  for (const pattern of TEMPORAL_PATTERNS) {
    if (pattern.test(query)) {
      return "temporal";
    }
  }

  // procedural: 手順・方法に関するクエリか
  for (const pattern of PROCEDURAL_PATTERNS) {
    if (pattern.test(query)) {
      return "procedural";
    }
  }

  // factual: 固有名詞・バージョン・定義クエリか
  for (const pattern of FACTUAL_PATTERNS) {
    if (pattern.test(query)) {
      return "factual";
    }
  }

  // デフォルト: 探索的クエリ
  return "exploratory";
}

const WEIGHTS_BY_TYPE: Record<QueryType, QueryWeights> = {
  factual: { vector: 0.3, graph: 0.5, agentic: 0.2 },
  temporal: { vector: 0.2, graph: 0.3, agentic: 0.5 },
  exploratory: { vector: 0.5, graph: 0.3, agentic: 0.2 },
  procedural: { vector: 0.3, graph: 0.2, agentic: 0.5 },
};

/**
 * クエリタイプに応じた検索層の重みを返す。
 * vector + graph + agentic の合計が 1.0 になることが保証される。
 */
export function getWeightsForQueryType(queryType: QueryType): QueryWeights {
  return WEIGHTS_BY_TYPE[queryType];
}
