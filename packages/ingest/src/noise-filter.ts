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

const BUNDLE_COMMIT_PATTERNS = [
  /^Bundle\s+\d{4}-W\d+/i,
  /^Merge\s+\d+\s+commits?\b/i,
  /^Auto-?merge\b/i,
];

const DEFAULT_BOT_AUTHORS = [
  "dependabot[bot]",
  "renovate[bot]",
  "netlify[bot]",
  "vercel[bot]",
  "github-actions[bot]",
  "greenkeeper[bot]",
  "codecov[bot]",
];

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
  private useGenericBotSuffix: boolean;
  private compiledExcludeMatcher: ((path: string) => boolean) | null;
  private compiledSubjectRegexes: RegExp[];

  constructor(config?: NoiseFilterConfig) {
    this.shortMessageThreshold = config?.shortMessageThreshold ?? DEFAULT_SHORT_MESSAGE_THRESHOLD;
    // Normalize to lowercase at construction time for case-insensitive comparison
    this.botAuthors = (config?.botAuthors ?? DEFAULT_BOT_AUTHORS).map((a) => a.toLowerCase());
    // 汎用 [bot] suffix 検出はデフォルトリスト使用時のみ有効
    // カスタム botAuthors が指定された場合はそのリストのみで判定する
    this.useGenericBotSuffix = config?.botAuthors === undefined;

    // Pre-compile exclude patterns
    this.compiledExcludeMatcher =
      config?.excludePatterns && config.excludePatterns.length > 0
        ? picomatch(config.excludePatterns)
        : null;

    // Pre-compile subject regexes with error handling for invalid patterns
    this.compiledSubjectRegexes = [];
    if (config?.noiseSubjectPatterns && config.noiseSubjectPatterns.length > 0) {
      for (const p of config.noiseSubjectPatterns) {
        try {
          this.compiledSubjectRegexes.push(new RegExp(p));
        } catch {
          // Skip invalid regex patterns silently
        }
      }
    }
  }

  isI18nOnlyCommit(relatedPaths: string[]): boolean {
    if (relatedPaths.length === 0) return false;
    return relatedPaths.every((p) => I18N_PATH_PATTERNS.some((re) => re.test(p)));
  }

  isDependabotCommit(subject: string, author?: string): boolean {
    if (author) {
      const lower = author.toLowerCase();
      if (this.botAuthors.includes(lower)) return true;
      // 汎用 [bot] suffix 検出: デフォルトリスト使用時のみ適用
      // カスタム botAuthors 指定時はそのリストが上書き semantics となる
      if (this.useGenericBotSuffix && lower.endsWith("[bot]")) return true;
    }
    return DEPENDABOT_SUBJECT_PATTERNS.some((re) => re.test(subject));
  }

  isShortCommitMessage(subject: string): boolean {
    return subject.trim().length < this.shortMessageThreshold;
  }

  isBundleCommit(subject: string): boolean {
    return BUNDLE_COMMIT_PATTERNS.some((re) => re.test(subject));
  }

  classify(subject: string, author: string, changedPaths: string[]): NoiseLevel {
    if (this.compiledExcludeMatcher && changedPaths.length > 0) {
      if (changedPaths.every((p) => this.compiledExcludeMatcher!(p))) return "noise";
    }

    if (
      this.compiledSubjectRegexes.length > 0 &&
      this.compiledSubjectRegexes.some((re) => re.test(subject))
    ) {
      return "noise";
    }

    if (this.isI18nOnlyCommit(changedPaths)) return "noise";
    if (this.isDependabotCommit(subject, author)) return "low-value";
    if (this.isBundleCommit(subject)) return "low-value";
    if (this.isShortCommitMessage(subject)) return "low-value";
    return "normal";
  }

  classifyWithConfidence(
    subject: string,
    author: string,
    changedPaths: string[],
  ): { level: NoiseLevel; confidence: number } {
    const level = this.classify(subject, author, changedPaths);
    const confidence = level === "noise" ? 0.0 : level === "low-value" ? 0.3 : 1.0;
    return { level, confidence };
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

export function classifyWithConfidence(
  subject: string,
  author: string,
  relatedPaths: string[],
): { level: NoiseLevel; confidence: number } {
  return defaultFilter.classifyWithConfidence(subject, author, relatedPaths);
}

export function isBundleCommit(subject: string): boolean {
  return defaultFilter.isBundleCommit(subject);
}
