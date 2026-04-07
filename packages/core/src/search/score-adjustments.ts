/**
 * Score discount constants and utilities shared across search modules.
 *
 * Centralises CHANGELOG/README discount, low-confidence discount, and
 * bot-author pattern so that every search path applies the same rules.
 */

/** Matches CHANGELOG, CHANGES, HISTORY, README with common extensions. */
export const CHANGELOG_PATTERN = /^(CHANGELOG|CHANGES|HISTORY|README)\.(md|txt|rst)$/i;

/** Multiplier applied to CHANGELOG/README scores (70 % reduction). */
export const CHANGELOG_DISCOUNT = 0.3;

/** Confidence threshold below which a note receives a score discount. */
export const LOW_CONFIDENCE_THRESHOLD = 0.3;

/** Multiplier applied to low-confidence note scores (50 % reduction). */
export const LOW_CONFIDENCE_DISCOUNT = 0.5;

/**
 * Pattern that identifies bot authors (e.g. "dependabot[bot]").
 *
 * Exported as a constant for search-time reference.  Bot notes already receive
 * a confidence value of 0 or 0.3 at ingest time via noise-filter, so a
 * separate discount multiplier is intentionally omitted to avoid double
 * penalisation.
 */
export const BOT_AUTHOR_PATTERN = /\[bot\]$/i;

/** Returns `true` when the file path's basename matches CHANGELOG_PATTERN. */
export function isChangelogOrReadme(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? "";
  return CHANGELOG_PATTERN.test(base);
}

/**
 * Apply standard score discounts to a normalised (0-1) score.
 *
 * Discounts are multiplicative:
 *  - CHANGELOG/README: ×0.3
 *  - Low confidence (≤ 0.3, non-null): ×0.5
 */
export function applyScoreDiscounts(
  score: number,
  options: { filePath: string; confidence: number | null },
): number {
  let adjusted = score;

  if (isChangelogOrReadme(options.filePath)) {
    adjusted *= CHANGELOG_DISCOUNT;
  }

  if (options.confidence !== null && options.confidence <= LOW_CONFIDENCE_THRESHOLD) {
    adjusted *= LOW_CONFIDENCE_DISCOUNT;
  }

  return adjusted;
}
