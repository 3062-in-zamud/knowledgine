import picomatch from "picomatch";

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

const DEFAULT_BOT_AUTHORS = ["dependabot[bot]", "renovate[bot]"];

const DEFAULT_SHORT_MESSAGE_THRESHOLD = 10;

export type NoiseLevel = "noise" | "low-value" | "normal";

export interface NoiseFilterConfig {
  shortMessageThreshold?: number;
  botAuthors?: string[];
  noiseSubjectPatterns?: string[];
  excludePatterns?: string[];
}

export class NoiseFilter {
  private shortMessageThreshold: number;
  private botAuthors: string[];
  private noiseSubjectPatterns: string[] | undefined;
  private excludePatterns: string[] | undefined;

  constructor(config?: NoiseFilterConfig) {
    this.shortMessageThreshold = config?.shortMessageThreshold ?? DEFAULT_SHORT_MESSAGE_THRESHOLD;
    this.botAuthors = config?.botAuthors ?? DEFAULT_BOT_AUTHORS;
    this.noiseSubjectPatterns = config?.noiseSubjectPatterns;
    this.excludePatterns = config?.excludePatterns;
  }

  isI18nOnlyCommit(relatedPaths: string[]): boolean {
    if (relatedPaths.length === 0) return false;
    return relatedPaths.every((p) => I18N_PATH_PATTERNS.some((re) => re.test(p)));
  }

  isDependabotCommit(subject: string, author?: string): boolean {
    if (author && this.botAuthors.includes(author.toLowerCase())) return true;
    return DEPENDABOT_SUBJECT_PATTERNS.some((re) => re.test(subject));
  }

  isShortCommitMessage(subject: string): boolean {
    return subject.trim().length < this.shortMessageThreshold;
  }

  classify(subject: string, author: string, changedPaths: string[]): NoiseLevel {
    if (this.excludePatterns && this.excludePatterns.length > 0 && changedPaths.length > 0) {
      const isMatch = picomatch(this.excludePatterns);
      if (changedPaths.every((p) => isMatch(p))) return "noise";
    }

    if (this.noiseSubjectPatterns && this.noiseSubjectPatterns.length > 0) {
      const subjectRegexes = this.noiseSubjectPatterns.map((p) => new RegExp(p));
      if (subjectRegexes.some((re) => re.test(subject))) return "noise";
    }

    if (this.isI18nOnlyCommit(changedPaths)) return "noise";
    if (this.isDependabotCommit(subject, author)) return "low-value";
    if (this.isShortCommitMessage(subject)) return "low-value";
    return "normal";
  }
}

const defaultFilter = new NoiseFilter();

/**
 * Returns true if all changed paths are i18n/l10n files.
 */
export function isI18nOnlyCommit(relatedPaths: string[]): boolean {
  return defaultFilter.isI18nOnlyCommit(relatedPaths);
}

/**
 * Returns true if the commit subject or author matches Dependabot/Renovate patterns.
 */
export function isDependabotCommit(subject: string, author?: string): boolean {
  return defaultFilter.isDependabotCommit(subject, author);
}

/**
 * Returns true if the commit message is shorter than the threshold.
 */
export function isShortCommitMessage(
  subject: string,
  threshold = DEFAULT_SHORT_MESSAGE_THRESHOLD,
): boolean {
  return subject.trim().length < threshold;
}

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
  return defaultFilter.classify(subject, author, relatedPaths);
}
