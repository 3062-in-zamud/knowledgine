const DECISION_PATTERNS =
  /理由は|トレードオフ|比較した結果|判断した|選択した|ではなく|代わりに|because|tradeoff|trade-off|alternative|instead of|chose|decided|pros and cons|considered|compared|rationale/i;

export function isDecisionPoint(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  return DECISION_PATTERNS.test(text);
}
