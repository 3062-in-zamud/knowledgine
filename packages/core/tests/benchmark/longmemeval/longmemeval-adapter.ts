/**
 * LongMemEval → Knowledgine クエリ変換アダプタ
 *
 * 問題ごとに in-memory DB を作成し、他問題のデータ混入を防ぐ。
 */
import type Database from "better-sqlite3";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  KnowledgeSearcher,
  ALL_MIGRATIONS,
} from "../../../src/index.js";
import type { SearchOptions } from "../../../src/search/knowledge-searcher.js";
import type {
  LongMemEvalEntry,
  LongMemEvalCategory,
  AdaptedQuery,
  ConversationTurn,
  HaystackSession,
} from "./types.js";

/**
 * LongMemEval の日付フォーマット "2023/05/20 (Sat) 02:21" を ISO 8601 に変換する。
 * パース失敗時は元の文字列をそのまま返す。
 */
function parseHaystackDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  // "YYYY/MM/DD (Ddd) HH:MM" 形式
  const m = dateStr.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+\([A-Za-z]+\)\s+(\d{2}):(\d{2})/);
  if (m) {
    const [, year, month, day, hour, minute] = m;
    return `${year}-${month}-${day}T${hour}:${minute}:00.000Z`;
  }
  return dateStr;
}

export interface IsolatedContext {
  db: Database.Database;
  repository: KnowledgeRepository;
  searcher: KnowledgeSearcher;
}

export function createIsolatedContext(): IsolatedContext {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  const searcher = new KnowledgeSearcher(repository);
  return { db, repository, searcher };
}

export function ingestHaystack(repository: KnowledgeRepository, entry: LongMemEvalEntry): void {
  const sessions = entry.haystack_sessions;

  for (let i = 0; i < sessions.length; i++) {
    const raw = sessions[i];

    // 実データ: ConversationTurn[][] 形式（session_id/dateは別フィールド）
    // モックデータ: HaystackSession 形式（session_id/dateが含まれる）
    let turns: ConversationTurn[];
    let sessionId: string;
    let date: string;

    if (Array.isArray(raw) && (raw.length === 0 || "role" in (raw as ConversationTurn[])[0])) {
      // ConversationTurn[] 形式（実データ）
      turns = raw as ConversationTurn[];
      sessionId = entry.haystack_session_ids[i] ?? `session_${i}`;
      date = entry.haystack_dates[i] ?? "";
    } else {
      // HaystackSession 形式（モックデータ）
      const s = raw as HaystackSession;
      turns = s.session;
      sessionId = s.session_id;
      date = s.date;
    }

    const isoDate = parseHaystackDate(date);
    const content = turns.map((turn) => `[${turn.role}]: ${turn.content}`).join("\n");

    repository.saveNote({
      filePath: `longmemeval/${sessionId}.md`,
      title: `Session ${sessionId}`,
      content,
      createdAt: isoDate,
      frontmatter: {
        session_id: sessionId,
        date: isoDate,
      },
    });
  }
}

export function detectCategory(entry: LongMemEvalEntry): LongMemEvalCategory {
  const qt = entry.question_type.toLowerCase();
  if (qt.includes("single-session-user")) return "single-session-user";
  if (qt.includes("single-session-assistant")) return "single-session-assistant";
  if (qt.includes("single-session-preference")) return "single-session-preference";
  if (qt.includes("temporal")) return "temporal-reasoning";
  if (qt.includes("knowledge-update") || qt.includes("knowledge_update")) return "knowledge-update";
  if (qt.includes("multi-session") || qt.includes("multi_session")) return "multi-session";
  // フォールバック: answer_session_ids で推定
  if (entry.answer_session_ids.length > 1) return "multi-session";
  return "single-session-user";
}

export function isAbstentionQuestion(entry: LongMemEvalEntry): boolean {
  return entry.question_id.endsWith("_abs");
}

/**
 * 自然言語クエリをFTS5 MATCH句として有効なキーワードクエリに変換する。
 * 特殊文字を除去し、ストップワードを除いたキーワードのOR結合を返す。
 * preference カテゴリでは "prefer" "favorite" "like" を優先して先頭に追加する。
 */
function toFts5Query(naturalQuery: string, category?: LongMemEvalCategory): string {
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "need",
    "dare",
    "ought",
    "used",
    "to",
    "of",
    "in",
    "on",
    "at",
    "for",
    "with",
    "by",
    "from",
    "up",
    "about",
    "into",
    "through",
    "during",
    "i",
    "my",
    "me",
    "we",
    "you",
    "your",
    "he",
    "she",
    "it",
    "they",
    "them",
    "what",
    "when",
    "where",
    "which",
    "who",
    "how",
    "why",
    "that",
    "this",
    "these",
    "those",
    "did",
    "not",
    "no",
    "and",
    "or",
    "but",
  ]);

  const keywords = naturalQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (keywords.length === 0) {
    // フォールバック: 特殊文字のみ除去した原文
    return naturalQuery.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
  }

  // preference カテゴリでは好み関連のキーワードを追加（検索ヒット率向上）
  if (category === "single-session-preference") {
    const prefKeywords = ["prefer", "favorite", "favourite", "love", "enjoy", "like"];
    const extra = prefKeywords.filter((k) => !keywords.includes(k));
    keywords.push(...extra);
  }

  // FTS5 OR クエリ: 各キーワードのいずれかを含むノートを検索
  return keywords.join(" OR ");
}

export function adaptQuery(entry: LongMemEvalEntry): AdaptedQuery {
  const category = detectCategory(entry);
  const isAbstention = isAbstentionQuestion(entry);

  const searchOptions: SearchOptions = {
    query: toFts5Query(entry.question, category),
    limit: 10,
    mode: "keyword",
  };

  // temporal-reasoning は question_date より前に絞る
  if (category === "temporal-reasoning" && entry.question_date) {
    searchOptions.dateTo = parseHaystackDate(entry.question_date);
  }

  return {
    originalEntry: entry,
    searchOptions,
    expectedAnswer: String(entry.answer),
    isAbstention,
  };
}

export class LongMemEvalAdapter {
  adaptAndRun(
    entry: LongMemEvalEntry,
    mode: "keyword" | "hybrid" | "agentic" = "keyword",
  ): {
    context: IsolatedContext;
    adaptedQuery: AdaptedQuery;
  } {
    const context = createIsolatedContext();
    ingestHaystack(context.repository, entry);

    const adaptedQuery = adaptQuery(entry);
    adaptedQuery.searchOptions.mode = mode === "agentic" ? "keyword" : mode;

    return { context, adaptedQuery };
  }
}
