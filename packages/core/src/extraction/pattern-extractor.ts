import type { ExtractedPattern, PatternType } from "../types.js";
import type { PatternRule, PatternConfig } from "./default-patterns.js";
import { DEFAULT_PATTERNS } from "./default-patterns.js";
import { CodeBlockDetector } from "../utils/code-block-detector.js";
import { ContextAnalyzer } from "./context-analyzer.js";

export class PatternExtractor {
  private config: PatternConfig;
  private codeBlockDetector: CodeBlockDetector;
  private contextAnalyzer: ContextAnalyzer;

  constructor(customPatterns?: Partial<PatternConfig>) {
    this.config = customPatterns ? { ...DEFAULT_PATTERNS, ...customPatterns } : DEFAULT_PATTERNS;
    this.codeBlockDetector = new CodeBlockDetector();
    this.contextAnalyzer = new ContextAnalyzer();
  }

  extractDailyPatterns(content: string): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    const lines = content.split("\n");

    for (const [patternType, rule] of Object.entries(this.config.dailyPatterns)) {
      if (!this.isValidPatternType(patternType)) continue;
      patterns.push(...this.extractPattern(lines, patternType, rule));
    }

    return patterns;
  }

  extractTicketPatterns(content: string): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    const lines = content.split("\n");

    for (const [patternKey, rule] of Object.entries(this.config.ticketPatterns)) {
      if (patternKey === "time") continue;

      const patternType = patternKey === "approach" ? "solution" : patternKey;
      if (!this.isValidPatternType(patternType)) continue;

      patterns.push(...this.extractPattern(lines, patternType, rule));
    }

    patterns.push(...this.extractTimePatterns(lines));
    return patterns;
  }

  private isValidPatternType(type: string): type is PatternType {
    return ["problem", "solution", "learning", "time"].includes(type);
  }

  private extractPattern(
    lines: string[],
    patternType: PatternType,
    rule: PatternRule,
  ): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    let inSection = false;
    let sectionContent: string[] = [];
    let sectionStartLine = 0;
    let sectionHeaderLine = -1;

    const content = lines.join("\n");
    const codeBlocks = this.codeBlockDetector.detectCodeBlocks(content);

    const headerPatterns = rule.patterns.filter((p) => p.startsWith("^##\\s+"));
    const contentPatterns = rule.patterns.filter((p) => !p.startsWith("^##\\s+"));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      if (this.codeBlockDetector.isInCodeBlock(i, codeBlocks)) {
        if (!this.isCodeComment(line)) continue;
      }

      const isSectionHeader = headerPatterns.some((pattern) => {
        try {
          return new RegExp(pattern, "i").test(line);
        } catch {
          return false;
        }
      });

      if (isSectionHeader) {
        if (inSection && sectionContent.length > 0) {
          patterns.push(
            this.createSectionPattern(
              lines,
              patternType,
              sectionContent,
              sectionStartLine,
              i - 1,
              sectionHeaderLine,
            ),
          );
        }
        inSection = true;
        sectionContent = [];
        sectionStartLine = i + 1;
        sectionHeaderLine = i;
      } else if (inSection) {
        if (line.match(/^##\s+/)) {
          if (sectionContent.length > 0) {
            patterns.push(
              this.createSectionPattern(
                lines,
                patternType,
                sectionContent,
                sectionStartLine,
                i - 1,
                sectionHeaderLine,
              ),
            );
          }
          inSection = false;
          sectionContent = [];
        } else {
          sectionContent.push(line);
        }
      } else {
        const hasContentPattern = contentPatterns.some((pattern) => {
          try {
            return new RegExp(pattern, "i").test(line);
          } catch {
            return false;
          }
        });

        if (hasContentPattern && line.trim().length > 0) {
          const previousLines = this.getPreviousLines(lines, i, 3);
          const lineContext = this.contextAnalyzer.analyzeLineContext(
            line,
            previousLines,
            this.config.confidence.medium,
          );

          patterns.push({
            type: patternType,
            content: line.trim(),
            confidence: lineContext.confidence,
            context: this.getContext(lines, i - 2, i + 2),
            lineNumber: i,
            contextType: lineContext.type,
          });
        }
      }
    }

    if (inSection && sectionContent.length > 0) {
      patterns.push(
        this.createSectionPattern(
          lines,
          patternType,
          sectionContent,
          sectionStartLine,
          lines.length - 1,
          sectionHeaderLine,
        ),
      );
    }

    return patterns;
  }

  private createSectionPattern(
    lines: string[],
    patternType: PatternType,
    sectionContent: string[],
    sectionStartLine: number,
    endLine: number,
    sectionHeaderLine: number,
  ): ExtractedPattern {
    const previousLines = this.getPreviousLines(lines, sectionHeaderLine, 3);
    const lineContext = this.contextAnalyzer.analyzeLineContext(
      lines[sectionHeaderLine] || "",
      previousLines,
      this.config.confidence.high,
    );

    return {
      type: patternType,
      content: sectionContent.join("\n").trim(),
      confidence: lineContext.confidence,
      context: this.getContext(lines, sectionStartLine, endLine),
      lineNumber: sectionStartLine,
      contextType: lineContext.type,
    };
  }

  private extractTimePatterns(lines: string[]): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    const timeRule = this.config.ticketPatterns.time;
    if (!timeRule) return patterns;

    const content = lines.join("\n");
    const codeBlocks = this.codeBlockDetector.detectCodeBlocks(content);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (this.codeBlockDetector.isInCodeBlock(i, codeBlocks)) continue;

      for (const pattern of timeRule.patterns) {
        try {
          const regex = new RegExp(pattern, "gi");
          const matches = line.matchAll(regex);
          for (const match of matches) {
            patterns.push({
              type: "time",
              content: match[0],
              confidence: this.config.confidence.high,
              context: this.getContext(lines, i - 1, i + 1),
              lineNumber: i,
            });
          }
        } catch {
          // Skip invalid patterns
        }
      }
    }

    return patterns;
  }

  private getContext(lines: string[], startLine: number, endLine: number): string {
    const start = Math.max(0, startLine);
    const end = Math.min(lines.length - 1, endLine);
    return lines.slice(start, end + 1).join("\n");
  }

  private getPreviousLines(lines: string[], lineNumber: number, count: number): string[] {
    if (lineNumber <= 0) return [];
    const start = Math.max(0, lineNumber - count);
    return lines.slice(start, lineNumber);
  }

  private isCodeComment(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("<!--") ||
      trimmed.startsWith("--")
    );
  }
}
