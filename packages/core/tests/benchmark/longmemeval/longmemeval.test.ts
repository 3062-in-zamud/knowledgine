/**
 * LongMemEval サニティチェック（CI実行用）
 *
 * - 最小限のモックデータで 5〜10 問のみ実行
 * - LLM 不要（ルールベースジャッジ）
 * - アダプタ変換・スコア計算ロジックを検証
 */
import { describe, it, expect } from "vitest";
import {
  LongMemEvalAdapter,
  detectCategory,
  isAbstentionQuestion,
  adaptQuery,
} from "./longmemeval-adapter.js";
import { LongMemEvalEvaluator } from "./longmemeval-evaluator.js";
import { toJson, toMarkdown, generateBadge } from "./longmemeval-reporter.js";
import { runBenchmark } from "./longmemeval-runner.js";
import type { LongMemEvalEntry, BenchmarkReport, EvalResult } from "./types.js";

// ミニマルテストデータ（実データ非依存）
const MOCK_ENTRIES: LongMemEvalEntry[] = [
  {
    question_id: "q001",
    question_type: "single-session-user",
    question: "What is my favorite programming language?",
    answer: "Python",
    question_date: "2024-06-01",
    haystack_session_ids: ["s001"],
    haystack_dates: ["2024-05-15"],
    haystack_sessions: [
      {
        session_id: "s001",
        date: "2024-05-15",
        session: [
          {
            role: "user",
            content: "I love Python. It is my favorite programming language.",
          },
          {
            role: "assistant",
            content: "Python is a great choice for many tasks.",
          },
        ],
      },
    ],
    answer_session_ids: ["s001"],
  },
  {
    question_id: "q002",
    question_type: "temporal-reasoning",
    question: "What did I discuss before June 2024?",
    answer: "Python programming",
    question_date: "2024-06-01",
    haystack_session_ids: ["s001"],
    haystack_dates: ["2024-05-15"],
    haystack_sessions: [
      {
        session_id: "s001",
        date: "2024-05-15",
        session: [
          { role: "user", content: "Let us talk about Python programming." },
          { role: "assistant", content: "Sure, Python programming is fun." },
        ],
      },
    ],
    answer_session_ids: ["s001"],
  },
  {
    question_id: "q003_abs",
    question_type: "single-session-user",
    question: "What is my favorite food?",
    answer: "I never mentioned my favorite food.",
    question_date: "2024-06-01",
    haystack_session_ids: ["s002"],
    haystack_dates: ["2024-05-20"],
    haystack_sessions: [
      {
        session_id: "s002",
        date: "2024-05-20",
        session: [
          { role: "user", content: "I enjoy hiking on weekends." },
          { role: "assistant", content: "Hiking is a wonderful activity." },
        ],
      },
    ],
    answer_session_ids: [],
  },
  {
    question_id: "q004",
    question_type: "multi-session",
    question: "What topics have I discussed?",
    answer: "Python and hiking",
    question_date: "2024-07-01",
    haystack_session_ids: ["s001", "s002"],
    haystack_dates: ["2024-05-15", "2024-05-20"],
    haystack_sessions: [
      {
        session_id: "s001",
        date: "2024-05-15",
        session: [
          { role: "user", content: "I love Python programming." },
          { role: "assistant", content: "Python is great." },
        ],
      },
      {
        session_id: "s002",
        date: "2024-05-20",
        session: [
          { role: "user", content: "I enjoy hiking on weekends." },
          { role: "assistant", content: "Hiking is wonderful." },
        ],
      },
    ],
    answer_session_ids: ["s001", "s002"],
  },
  {
    question_id: "q005",
    question_type: "knowledge-update",
    question: "What is my current job?",
    answer: "Software Engineer",
    question_date: "2024-07-01",
    haystack_session_ids: ["s003"],
    haystack_dates: ["2024-06-01"],
    haystack_sessions: [
      {
        session_id: "s003",
        date: "2024-06-01",
        session: [
          {
            role: "user",
            content: "I just started a new job as a Software Engineer.",
          },
          { role: "assistant", content: "Congratulations on your new role." },
        ],
      },
    ],
    answer_session_ids: ["s003"],
  },
];

describe("LongMemEval アダプタ", () => {
  describe("detectCategory", () => {
    it("question_type から single-session-user を判定できる", () => {
      expect(detectCategory(MOCK_ENTRIES[0])).toBe("single-session-user");
    });

    it("question_type から temporal-reasoning を判定できる", () => {
      expect(detectCategory(MOCK_ENTRIES[1])).toBe("temporal-reasoning");
    });

    it("question_type から multi-session を判定できる", () => {
      expect(detectCategory(MOCK_ENTRIES[3])).toBe("multi-session");
    });

    it("question_type から knowledge-update を判定できる", () => {
      expect(detectCategory(MOCK_ENTRIES[4])).toBe("knowledge-update");
    });
  });

  describe("isAbstentionQuestion", () => {
    it("_abs サフィックスの問題を abstention として判定する", () => {
      expect(isAbstentionQuestion(MOCK_ENTRIES[2])).toBe(true);
    });

    it("通常の問題は abstention でない", () => {
      expect(isAbstentionQuestion(MOCK_ENTRIES[0])).toBe(false);
    });
  });

  describe("adaptQuery", () => {
    it("temporal-reasoning に dateTo が設定される", () => {
      const adapted = adaptQuery(MOCK_ENTRIES[1]);
      expect(adapted.searchOptions.dateTo).toBe("2024-06-01");
    });

    it("通常クエリに dateTo は設定されない", () => {
      const adapted = adaptQuery(MOCK_ENTRIES[0]);
      expect(adapted.searchOptions.dateTo).toBeUndefined();
    });

    it("isAbstention が正しく設定される", () => {
      const normalAdapted = adaptQuery(MOCK_ENTRIES[0]);
      const absAdapted = adaptQuery(MOCK_ENTRIES[2]);
      expect(normalAdapted.isAbstention).toBe(false);
      expect(absAdapted.isAbstention).toBe(true);
    });

    it("searchOptions.query にクエリキーワードが含まれる", () => {
      const adapted = adaptQuery(MOCK_ENTRIES[0]);
      // FTS5クエリに変換されるため原文と同一ではないが、主要キーワードを含む
      expect(adapted.searchOptions.query).toBeDefined();
      expect(adapted.searchOptions.query!.length).toBeGreaterThan(0);
    });
  });

  describe("ingestHaystack", () => {
    it("セッションが KnowledgeNote として DB に投入される", () => {
      const adapter = new LongMemEvalAdapter();
      const { context } = adapter.adaptAndRun(MOCK_ENTRIES[0]);

      try {
        const repo = context.repository;
        const note = repo.getNoteByPath("longmemeval/s001.md");
        expect(note).toBeDefined();
        expect(note?.content).toContain("[user]:");
        expect(note?.content).toContain("[assistant]:");
        expect(note?.content).toContain("Python");
      } finally {
        context.db.close();
      }
    });

    it("複数セッションがそれぞれ別ノートになる", () => {
      const adapter = new LongMemEvalAdapter();
      const { context } = adapter.adaptAndRun(MOCK_ENTRIES[3]);

      try {
        const note1 = context.repository.getNoteByPath("longmemeval/s001.md");
        const note2 = context.repository.getNoteByPath("longmemeval/s002.md");
        expect(note1).toBeDefined();
        expect(note2).toBeDefined();
      } finally {
        context.db.close();
      }
    });

    it("問題ごとに別 DB が作成される（データ混入なし）", () => {
      const adapter = new LongMemEvalAdapter();
      const { context: ctx1 } = adapter.adaptAndRun(MOCK_ENTRIES[0]);
      const { context: ctx2 } = adapter.adaptAndRun(MOCK_ENTRIES[2]);

      try {
        // ctx2 は s002 のみ持つはず
        const noteInCtx2 = ctx2.repository.getNoteByPath("longmemeval/s002.md");
        const crossNote = ctx2.repository.getNoteByPath("longmemeval/s001.md");
        expect(noteInCtx2).toBeDefined();
        expect(crossNote).toBeUndefined();
      } finally {
        ctx1.db.close();
        ctx2.db.close();
      }
    });
  });
});

describe("LongMemEval エバリュエータ（ルールベース）", () => {
  const evaluator = LongMemEvalEvaluator.createRuleBased();

  it("完全一致で correct=true", async () => {
    const result = await evaluator.judge(
      "What is your name?",
      "Python",
      "Python",
      "single-session-user",
      "q001",
      [],
      10,
    );
    expect(result.correct).toBe(true);
    expect(result.evalMethod).toBe("rule");
  });

  it("部分一致で correct=true", async () => {
    const result = await evaluator.judge(
      "What is your name?",
      "I love Python programming and data science.",
      "Python",
      "single-session-user",
      "q001",
      [],
      10,
    );
    expect(result.correct).toBe(true);
  });

  it("不一致で correct=false", async () => {
    const result = await evaluator.judge(
      "What is your name?",
      "Java is my favorite language.",
      "Python",
      "single-session-user",
      "q001",
      [],
      10,
    );
    expect(result.correct).toBe(false);
  });

  it("_abs 問題は isAbstention=true", async () => {
    const result = await evaluator.judge(
      "What is your food?",
      "I never mentioned food.",
      "I never mentioned my favorite food.",
      "single-session-user",
      "q003_abs",
      [],
      10,
    );
    expect(result.isAbstention).toBe(true);
  });

  describe("computeScores", () => {
    it("空配列で全スコア 0", () => {
      const scores = evaluator.computeScores([]);
      expect(scores.overallAccuracy).toBe(0);
      expect(scores.taskAveragedAccuracy).toBe(0);
      expect(scores.abstentionAccuracy).toBe(0);
    });

    it("全問正解で overallAccuracy=1.0", () => {
      const results: EvalResult[] = [
        {
          questionId: "q1",
          category: "single-session-user",
          isAbstention: false,
          correct: true,
          hypothesis: "A",
          expectedAnswer: "A",
          retrievedNoteIds: [],
          retrievalLatencyMs: 10,
          evalMethod: "rule",
        },
        {
          questionId: "q2",
          category: "multi-session",
          isAbstention: false,
          correct: true,
          hypothesis: "B",
          expectedAnswer: "B",
          retrievedNoteIds: [],
          retrievalLatencyMs: 10,
          evalMethod: "rule",
        },
      ];
      const scores = evaluator.computeScores(results);
      expect(scores.overallAccuracy).toBe(1.0);
    });

    it("Task-Averaged Accuracy はカテゴリ別 accuracy の平均", () => {
      const results: EvalResult[] = [
        {
          questionId: "q1",
          category: "single-session-user",
          isAbstention: false,
          correct: true,
          hypothesis: "A",
          expectedAnswer: "A",
          retrievedNoteIds: [],
          retrievalLatencyMs: 10,
          evalMethod: "rule",
        },
        {
          questionId: "q2",
          category: "single-session-user",
          isAbstention: false,
          correct: false,
          hypothesis: "X",
          expectedAnswer: "A",
          retrievedNoteIds: [],
          retrievalLatencyMs: 10,
          evalMethod: "rule",
        },
        {
          questionId: "q3",
          category: "multi-session",
          isAbstention: false,
          correct: true,
          hypothesis: "B",
          expectedAnswer: "B",
          retrievedNoteIds: [],
          retrievalLatencyMs: 10,
          evalMethod: "rule",
        },
      ];
      const scores = evaluator.computeScores(results);
      // single-session-user: 1/2 = 0.5, multi-session: 1/1 = 1.0 → avg = 0.75
      expect(scores.taskAveragedAccuracy).toBeCloseTo(0.75, 5);
    });

    it("abstentionAccuracy は _abs 問題のみで計算", () => {
      const results: EvalResult[] = [
        {
          questionId: "q1_abs",
          category: "single-session-user",
          isAbstention: true,
          correct: true,
          hypothesis: "A",
          expectedAnswer: "A",
          retrievedNoteIds: [],
          retrievalLatencyMs: 10,
          evalMethod: "rule",
        },
        {
          questionId: "q2",
          category: "single-session-user",
          isAbstention: false,
          correct: false,
          hypothesis: "X",
          expectedAnswer: "A",
          retrievedNoteIds: [],
          retrievalLatencyMs: 10,
          evalMethod: "rule",
        },
      ];
      const scores = evaluator.computeScores(results);
      expect(scores.abstentionAccuracy).toBe(1.0);
    });
  });
});

describe("LongMemEval レポーター", () => {
  const sampleReport: BenchmarkReport = {
    timestamp: "2024-01-01T00:00:00.000Z",
    datasetVersion: "longmemeval_s_cleaned",
    mode: "keyword",
    overallAccuracy: 0.65,
    taskAveragedAccuracy: 0.72,
    abstentionAccuracy: 0.8,
    categoryScores: [
      {
        category: "single-session-user",
        accuracy: 0.75,
        count: 100,
        correct: 75,
      },
      { category: "multi-session", accuracy: 0.6, count: 100, correct: 60 },
    ],
    totalQuestions: 200,
    totalLatencyMs: 5000,
    avgLatencyMs: 25,
  };

  it("JSON 出力が valid JSON", () => {
    const json = toJson(sampleReport);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.taskAveragedAccuracy).toBe(0.72);
  });

  it("Markdown 出力にカテゴリ表が含まれる", () => {
    const md = toMarkdown(sampleReport);
    expect(md).toContain("# LongMemEval Benchmark Report");
    expect(md).toContain("single-session-user");
    expect(md).toContain("72.0%");
  });

  it("70% 以上でバッジが brightgreen", () => {
    const badge = generateBadge(sampleReport);
    expect(badge).toContain("brightgreen");
  });

  it("50% 未満でバッジが red", () => {
    const lowReport = { ...sampleReport, taskAveragedAccuracy: 0.45 };
    const badge = generateBadge(lowReport);
    expect(badge).toContain("red");
  });
});

describe("LongMemEval ランナー（ミニマル統合テスト）", () => {
  it("5問のサニティチェックが完走する", async () => {
    const report = await runBenchmark(MOCK_ENTRIES, {
      mode: "keyword",
      judgeMode: "rule",
    });

    expect(report.totalQuestions).toBe(MOCK_ENTRIES.length);
    expect(report.mode).toBe("keyword");
    expect(report.overallAccuracy).toBeGreaterThanOrEqual(0);
    expect(report.overallAccuracy).toBeLessThanOrEqual(1);
    expect(report.taskAveragedAccuracy).toBeGreaterThanOrEqual(0);
    expect(report.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.categoryScores.length).toBeGreaterThan(0);
  }, 30_000);
});
