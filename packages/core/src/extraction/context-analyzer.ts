export enum ContextType {
  SECTION_HEADER = "section_header",
  LIST_ITEM = "list_item",
  BODY_TEXT = "body_text",
  CODE_COMMENT = "code_comment",
}

export interface LineContext {
  type: ContextType;
  confidence: number;
}

export class ContextAnalyzer {
  private static readonly HEADER_PATTERN = /^#{1,6}\s+/;
  private static readonly LIST_PATTERN = /^\s*[-*+]\s+/;
  private static readonly COMMENT_PATTERN = /^\s*\/\//;

  private static readonly CONFIDENCE_MULTIPLIERS: Record<ContextType, number> = {
    [ContextType.SECTION_HEADER]: 1.2,
    [ContextType.LIST_ITEM]: 1.0,
    [ContextType.BODY_TEXT]: 0.9,
    [ContextType.CODE_COMMENT]: 0.8,
  };

  analyzeContext(line: string, previousLines: string[]): ContextType {
    if (ContextAnalyzer.HEADER_PATTERN.test(line)) {
      return ContextType.SECTION_HEADER;
    }

    if (previousLines.length > 0) {
      const lastLine = previousLines[previousLines.length - 1];
      if (lastLine && ContextAnalyzer.HEADER_PATTERN.test(lastLine)) {
        return ContextType.SECTION_HEADER;
      }
    }

    if (ContextAnalyzer.LIST_PATTERN.test(line)) {
      return ContextType.LIST_ITEM;
    }

    if (ContextAnalyzer.COMMENT_PATTERN.test(line)) {
      return ContextType.CODE_COMMENT;
    }

    return ContextType.BODY_TEXT;
  }

  calculateConfidence(contextType: ContextType, baseConfidence: number): number {
    const multiplier = ContextAnalyzer.CONFIDENCE_MULTIPLIERS[contextType] ?? 1.0;
    const adjusted = baseConfidence * multiplier;
    return Math.min(adjusted, 0.9);
  }

  analyzeLineContext(line: string, previousLines: string[], baseConfidence: number): LineContext {
    const contextType = this.analyzeContext(line, previousLines);
    const confidence = this.calculateConfidence(contextType, baseConfidence);
    return { type: contextType, confidence };
  }

  getMultiplier(contextType: ContextType): number {
    return ContextAnalyzer.CONFIDENCE_MULTIPLIERS[contextType] ?? 1.0;
  }
}
