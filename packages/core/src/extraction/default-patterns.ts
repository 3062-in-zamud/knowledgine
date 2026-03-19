export interface PatternRule {
  patterns: string[];
  description: string;
}

export interface ClassificationRule {
  patterns: string[];
  description: string;
  confidence: number;
}

export interface PatternConfig {
  dailyPatterns: Record<string, PatternRule>;
  ticketPatterns: Record<string, PatternRule>;
  classificationRules: Record<string, ClassificationRule>;
  confidence: {
    high: number;
    medium: number;
    low: number;
  };
}

export const DEFAULT_PATTERNS: PatternConfig = {
  dailyPatterns: {
    problem: {
      patterns: [
        "同じエラー|また発生|繰り返し",
        "error.*same|again|recurring",
        "^##\\s+問題\\s*$",
        "^##\\s+Problems?\\s*$",
        "問題:|Problem:|エラー:|Error:|失敗:|Failed:",
      ],
      description: "Problems and errors encountered",
    },
    solution: {
      patterns: [
        "解決|修正|完了|fixed|solved|resolved",
        "^##\\s+解決\\s*$",
        "^##\\s+Solutions?\\s*$",
        "解決策:|Solution:|対処法:|修正方法:",
      ],
      description: "Solutions and fixes applied",
    },
    learning: {
      patterns: [
        "^##\\s+学び\\s*$",
        "^##\\s+Learning|Learned\\s*$",
        "学んだこと:|Learned:|気づき:|Insight:",
        "次回は|Next time|今後は",
      ],
      description: "Learnings and insights",
    },
    time: {
      patterns: [
        "(\\d+)\\s*時間",
        "(\\d+)\\s*分",
        "(\\d+)\\s*h(?:our)?s?",
        "(\\d+)\\s*m(?:in)?s?",
        "見積[もり]*[：:]\\s*(\\d+)",
        "実績[：:]\\s*(\\d+)",
      ],
      description: "Time estimates and actuals",
    },
  },
  ticketPatterns: {
    problem: {
      patterns: [
        "^##\\s+問題定義\\s*$",
        "^##\\s+Problem\\s*$",
        "^##\\s+課題\\s*$",
        "^##\\s+Issue\\s*$",
        "エラー:|Error:|バグ:|Bug:",
      ],
      description: "Problem definition in tickets",
    },
    solution: {
      patterns: [
        "^##\\s+解決\\s*$",
        "^##\\s+Resolution\\s*$",
        "^##\\s+実装結果\\s*$",
        "^##\\s+Result\\s*$",
        "完了:|Completed:|実装:|Implemented:",
      ],
      description: "Solution and resolution",
    },
    learning: {
      patterns: [
        "^##\\s+学び\\s*$",
        "^##\\s+Learnings?\\s*$",
        "学んだこと:|Learned:|知見:|Takeaway:",
      ],
      description: "Learnings from ticket work",
    },
    time: {
      patterns: [
        "(\\d+)\\s*時間",
        "(\\d+)\\s*分",
        "(\\d+)\\s*h(?:our)?s?",
        "(\\d+)\\s*m(?:in)?s?",
        "見積[もり]*[：:]\\s*(\\d+)",
        "実績[：:]\\s*(\\d+)",
      ],
      description: "Time estimates and actuals",
    },
  },
  classificationRules: {
    recurring_error: {
      patterns: [
        "同じエラー.*again|また発生|繰り返し",
        "error.*same.*again",
        "recurring.*error",
        "再度.*エラー",
      ],
      description: "Recurring errors that happened before",
      confidence: 0.8,
    },
    solution_found: {
      patterns: [
        "solved|fixed|解決|修正完了",
        "問題.*解決|issue.*solved",
        "完了.*修正|completed.*fix",
      ],
      description: "Solutions that resolved problems",
      confidence: 0.9,
    },
    time_estimate: {
      patterns: [
        "\\d+[hH時間分min]",
        "見積[もり]*[：:]\\s*\\d+",
        "実績[：:]\\s*\\d+",
        "estimate.*\\d+.*hours?",
      ],
      description: "Time estimates and actuals",
      confidence: 0.7,
    },
  },
  confidence: {
    high: 0.9,
    medium: 0.7,
    low: 0.5,
  },
};
