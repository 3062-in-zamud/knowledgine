/**
 * CJK text detection and processing utilities.
 * Shared by knowledge-repository.ts and hybrid-searcher.ts.
 */

const CJK_RANGE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;
const CJK_RANGE_GLOBAL = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g;

/** Returns true if the text contains any CJK characters. */
export function hasCjk(text: string): boolean {
  return CJK_RANGE.test(text);
}

/** Returns the ratio of CJK characters to total characters (0.0 - 1.0). */
export function cjkRatio(text: string): number {
  if (text.length === 0) return 0;
  const matches = text.match(CJK_RANGE_GLOBAL);
  return matches ? matches.length / text.length : 0;
}

/** Returns the count of CJK characters in text. */
export function cjkCharCount(text: string): number {
  const matches = text.match(CJK_RANGE_GLOBAL);
  return matches ? matches.length : 0;
}
