/** Patterns that indicate i18n/l10n file paths */
const I18N_PATH_PATTERNS = [
  /^(.*\/)?locales?\//i,
  /^(.*\/)?translations?\//i,
  /^(.*\/)?i18n\//i,
  /^(.*\/)?l10n\//i,
  /^(.*\/)?lang\//i,
  /^(.*\/)?messages\//i,
];

/** Patterns for Dependabot/Renovate commit subjects */
const DEPENDABOT_SUBJECT_PATTERNS = [
  /^chore\(deps(-dev)?\):/i,
  /^build\(deps(-dev)?\):/i,
  /^bump\s+\S+\s+from\s+/i,
];

/** Known bot authors */
const BOT_AUTHORS = ["dependabot[bot]", "renovate[bot]"];

const SHORT_MESSAGE_THRESHOLD = 10;

/**
 * Returns true if all changed paths are i18n/l10n files.
 */
export function isI18nOnlyCommit(relatedPaths: string[]): boolean {
  if (relatedPaths.length === 0) return false;
  return relatedPaths.every((p) => I18N_PATH_PATTERNS.some((re) => re.test(p)));
}

/**
 * Returns true if the commit subject or author matches Dependabot/Renovate patterns.
 */
export function isDependabotCommit(subject: string, author?: string): boolean {
  if (author && BOT_AUTHORS.includes(author.toLowerCase())) return true;
  return DEPENDABOT_SUBJECT_PATTERNS.some((re) => re.test(subject));
}

/**
 * Returns true if the commit message is shorter than the threshold.
 */
export function isShortCommitMessage(
  subject: string,
  threshold = SHORT_MESSAGE_THRESHOLD,
): boolean {
  return subject.trim().length < threshold;
}

export type NoiseLevel = "noise" | "low-value" | "normal";

/**
 * Classify a commit's noise level based on its characteristics.
 * - "noise": should be excluded from indexing by default
 * - "low-value": should be indexed but with lower confidence score
 * - "normal": regular commit
 */
export function classifyNoiseLevel(
  subject: string,
  author: string,
  relatedPaths: string[],
): NoiseLevel {
  if (isI18nOnlyCommit(relatedPaths)) return "noise";
  if (isDependabotCommit(subject, author)) return "low-value";
  if (isShortCommitMessage(subject)) return "low-value";
  return "normal";
}
