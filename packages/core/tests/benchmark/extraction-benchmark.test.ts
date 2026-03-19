import { describe, it, expect } from "vitest";
import { PatternExtractor } from "../../src/extraction/pattern-extractor.js";

function generateTestNote(index: number): string {
  return `---
tags:
  - test
  - note-${index}
---
# テストノート ${index}

## 問題
テスト問題 ${index}: TypeScriptのビルドが失敗する。
同じエラーが繰り返し発生している。
デバッグに3時間かかった。

## 解決
tsconfig.jsonを修正して解決した。
修正完了: 設定ファイルの更新。

## 学び
学んだこと: パス解決の仕組みを理解する必要がある。
次回は早めに設定を確認する。

エラー: 型推論の問題
Solution: 明示的な型アノテーション

見積: 8時間
実績: 6時間

${Array.from({ length: 30 }, (_, i) => `追加コンテンツ行 ${i + 1}: これはテスト用のダミーテキストです。`).join("\n")}
`;
}

describe("Extraction Benchmark", () => {
  it("should extract patterns from 100 notes within performance budget", () => {
    const extractor = new PatternExtractor();
    const notes = Array.from({ length: 100 }, (_, i) => generateTestNote(i));

    const start = performance.now();
    let totalPatterns = 0;

    for (const note of notes) {
      const daily = extractor.extractDailyPatterns(note);
      const ticket = extractor.extractTicketPatterns(note);
      totalPatterns += daily.length + ticket.length;
    }

    const elapsed = performance.now() - start;
    const perNote = elapsed / 100;

    console.log(
      `[Benchmark] Extraction: ${elapsed.toFixed(1)}ms total, ${perNote.toFixed(2)}ms/note, ${totalPatterns} patterns`,
    );
    console.log(`[Benchmark] Target: <100ms/note (ideal), <300ms/note (CI threshold)`);

    expect(totalPatterns).toBeGreaterThan(0);
    expect(perNote).toBeLessThan(300); // CI threshold
  });
});
