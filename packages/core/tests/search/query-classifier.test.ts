import { describe, it, expect } from "vitest";
import { classifyQuery, getWeightsForQueryType } from "../../src/search/query-classifier.js";
import type { QueryType } from "../../src/search/query-classifier.js";

describe("classifyQuery", () => {
  describe("temporal クエリの判定", () => {
    it("先週を含むクエリはtemporalと判定する", () => {
      expect(classifyQuery("先週のバグ修正")).toBe("temporal");
    });

    it("昨日を含むクエリはtemporalと判定する", () => {
      expect(classifyQuery("昨日のデプロイ記録")).toBe("temporal");
    });

    it("日付パターン(YYYY-MM-DD)はtemporalと判定する", () => {
      expect(classifyQuery("2024-01-01のデプロイ")).toBe("temporal");
    });

    it("最近を含むクエリはtemporalと判定する", () => {
      expect(classifyQuery("最近の変更点")).toBe("temporal");
    });

    it("英語の時間表現(ago)はtemporalと判定する", () => {
      expect(classifyQuery("issues 3 days ago")).toBe("temporal");
    });

    it("英語のlast weekはtemporalと判定する", () => {
      expect(classifyQuery("last week deployment")).toBe("temporal");
    });

    it("日付スラッシュ形式(YYYY/MM/DD)はtemporalと判定する", () => {
      expect(classifyQuery("2024/03/15の更新")).toBe("temporal");
    });

    it("月を含むクエリはtemporalと判定する", () => {
      expect(classifyQuery("3月のリリース")).toBe("temporal");
    });
  });

  describe("procedural クエリの判定", () => {
    it("デプロイ手順はproceduralと判定する", () => {
      expect(classifyQuery("デプロイ手順")).toBe("procedural");
    });

    it("方法を含むクエリはproceduralと判定する", () => {
      expect(classifyQuery("Dockerのインストール方法")).toBe("procedural");
    });

    it("how toを含むクエリはproceduralと判定する", () => {
      expect(classifyQuery("how to deploy to production")).toBe("procedural");
    });

    it("stepsを含むクエリはproceduralと判定する", () => {
      expect(classifyQuery("setup steps for node.js")).toBe("procedural");
    });

    it("やり方を含むクエリはproceduralと判定する", () => {
      expect(classifyQuery("設定のやり方")).toBe("procedural");
    });

    it("手順を含むクエリはproceduralと判定する", () => {
      expect(classifyQuery("環境構築の手順")).toBe("procedural");
    });
  });

  describe("factual クエリの判定", () => {
    it("とはを含むクエリはfactualと判定する", () => {
      expect(classifyQuery("React v18とは")).toBe("factual");
    });

    it("バージョン番号(v1.2.3)を含むクエリはfactualと判定する", () => {
      expect(classifyQuery("TypeScript v5.0の新機能")).toBe("factual");
    });

    it("what isを含むクエリはfactualと判定する", () => {
      expect(classifyQuery("what is GraphQL")).toBe("factual");
    });

    it("versionを含むクエリはfactualと判定する", () => {
      expect(classifyQuery("TypeScriptのバージョン確認")).toBe("factual");
    });

    it("キャメルケースの固有名詞はfactualと判定する", () => {
      expect(classifyQuery("TypeScript").toLowerCase()).toBeDefined();
      // TypeScriptはキャメルケース固有名詞パターンに該当
      const result = classifyQuery("TypeScript");
      expect(result).toBe("factual");
    });
  });

  describe("exploratory クエリのデフォルト判定", () => {
    it("他に該当しないクエリはexploratoryと判定する", () => {
      expect(classifyQuery("認証の仕組み")).toBe("exploratory");
    });

    it("一般的な技術クエリはexploratoryと判定する", () => {
      expect(classifyQuery("マイクロサービスアーキテクチャ")).toBe("exploratory");
    });

    it("空文字はexploratoryと判定する", () => {
      expect(classifyQuery("")).toBe("exploratory");
    });

    it("検索クエリのみはexploratoryと判定する", () => {
      expect(classifyQuery("パフォーマンス最適化")).toBe("exploratory");
    });
  });
});

describe("getWeightsForQueryType", () => {
  it("factualの重みが正しい", () => {
    const weights = getWeightsForQueryType("factual");
    expect(weights.vector).toBe(0.3);
    expect(weights.graph).toBe(0.5);
    expect(weights.agentic).toBe(0.2);
  });

  it("temporalの重みが正しい", () => {
    const weights = getWeightsForQueryType("temporal");
    expect(weights.vector).toBe(0.2);
    expect(weights.graph).toBe(0.3);
    expect(weights.agentic).toBe(0.5);
  });

  it("exploratoryの重みが正しい", () => {
    const weights = getWeightsForQueryType("exploratory");
    expect(weights.vector).toBe(0.5);
    expect(weights.graph).toBe(0.3);
    expect(weights.agentic).toBe(0.2);
  });

  it("proceduralの重みが正しい", () => {
    const weights = getWeightsForQueryType("procedural");
    expect(weights.vector).toBe(0.3);
    expect(weights.graph).toBe(0.2);
    expect(weights.agentic).toBe(0.5);
  });

  it("全タイプで重みの合計が1.0", () => {
    const types: QueryType[] = ["factual", "temporal", "exploratory", "procedural"];
    for (const type of types) {
      const w = getWeightsForQueryType(type);
      const sum = w.vector + w.graph + w.agentic;
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });
});
