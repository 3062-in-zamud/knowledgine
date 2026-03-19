import type { ExtractedPattern } from "../types.js";
import { DEFAULT_PATTERNS } from "./default-patterns.js";

export interface ClassificationResult {
  patternId?: number;
  category: string;
  confidence: number;
  matchedRule: string;
}

export class RuleBasedClassifier {
  private rules = DEFAULT_PATTERNS.classificationRules;

  classify(pattern: ExtractedPattern): ClassificationResult[] {
    const results: ClassificationResult[] = [];
    const content = pattern.content;

    for (const [category, rule] of Object.entries(this.rules)) {
      for (const patternRegex of rule.patterns) {
        try {
          const regex = new RegExp(patternRegex, "i");
          if (regex.test(content)) {
            results.push({
              category,
              confidence: rule.confidence,
              matchedRule: patternRegex,
            });
            break;
          }
        } catch {
          // Skip invalid patterns
        }
      }
    }

    return results;
  }

  classifyPatterns(patterns: ExtractedPattern[]): ClassificationResult[] {
    const allResults: ClassificationResult[] = [];
    for (const pattern of patterns) {
      allResults.push(...this.classify(pattern));
    }
    return allResults;
  }
}
