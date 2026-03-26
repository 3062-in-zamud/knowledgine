/**
 * LongMemEval ベンチマーク用型定義
 * https://github.com/xiaowu0162/LongMemEval
 */
import type { SearchOptions } from "../../../src/search/knowledge-searcher.js";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface HaystackSession {
  session_id: string;
  date: string;
  session: ConversationTurn[];
}

export interface LongMemEvalEntry {
  question_id: string;
  question_type: string;
  question: string;
  answer: string | number;
  question_date: string;
  haystack_session_ids: string[];
  haystack_dates: string[];
  /**
   * 実データでは ConversationTurn[][] 形式（配列の配列）。
   * haystack_session_ids / haystack_dates と同じインデックスで対応。
   * テスト用モックデータ互換のため HaystackSession[] も許容。
   */
  haystack_sessions: HaystackSession[] | ConversationTurn[][];
  answer_session_ids: string[];
}

export type LongMemEvalCategory =
  | "single-session-user"
  | "single-session-assistant"
  | "single-session-preference"
  | "temporal-reasoning"
  | "knowledge-update"
  | "multi-session";

export interface AdaptedQuery {
  originalEntry: LongMemEvalEntry;
  searchOptions: SearchOptions;
  expectedAnswer: string;
  isAbstention: boolean;
}

export interface EvalResult {
  questionId: string;
  category: LongMemEvalCategory;
  isAbstention: boolean;
  correct: boolean;
  hypothesis: string;
  expectedAnswer: string;
  retrievedNoteIds: number[];
  retrievalLatencyMs: number;
  evalMethod: "llm" | "rule";
}

export interface CategoryScore {
  category: LongMemEvalCategory;
  accuracy: number;
  count: number;
  correct: number;
}

export interface BenchmarkReport {
  timestamp: string;
  datasetVersion: string;
  mode: "keyword" | "hybrid" | "agentic";
  overallAccuracy: number;
  taskAveragedAccuracy: number;
  abstentionAccuracy: number;
  categoryScores: CategoryScore[];
  totalQuestions: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
}
