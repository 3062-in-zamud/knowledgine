export interface CodeBlockRange {
  startLine: number;
  endLine: number;
  language?: string;
  type: "fenced" | "inline";
}

export class CodeBlockDetector {
  private static readonly CODE_BLOCK_START = /^```(\w+)?/;
  private static readonly CODE_BLOCK_END = /^```\s*$/;
  private static readonly INLINE_CODE = /(?<!`)`(?!`)[^`]+`(?!`)/g;

  detectCodeBlocks(content: string): CodeBlockRange[] {
    const lines = content.split("\n");
    const codeBlocks: CodeBlockRange[] = [];
    let inCodeBlock = false;
    let currentBlockStart = -1;
    let currentLanguage: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      if (!inCodeBlock && CodeBlockDetector.CODE_BLOCK_START.test(line)) {
        const match = line.match(CodeBlockDetector.CODE_BLOCK_START);
        inCodeBlock = true;
        currentBlockStart = i;
        currentLanguage = match?.[1];
        continue;
      }

      if (inCodeBlock && CodeBlockDetector.CODE_BLOCK_END.test(line)) {
        codeBlocks.push({
          startLine: currentBlockStart,
          endLine: i,
          ...(currentLanguage !== undefined && { language: currentLanguage }),
          type: "fenced",
        });
        inCodeBlock = false;
        currentBlockStart = -1;
        currentLanguage = undefined;
        continue;
      }
    }

    if (inCodeBlock && currentBlockStart !== -1) {
      codeBlocks.push({
        startLine: currentBlockStart,
        endLine: lines.length - 1,
        ...(currentLanguage !== undefined && { language: currentLanguage }),
        type: "fenced",
      });
    }

    return codeBlocks;
  }

  isInCodeBlock(lineNumber: number, codeBlocks: CodeBlockRange[]): boolean {
    return codeBlocks.some((block) => lineNumber >= block.startLine && lineNumber <= block.endLine);
  }

  hasInlineCode(line: string): boolean {
    const inlineCodeRegex = /(?<!`)`(?!`)[^`]+`(?!`)/;
    return inlineCodeRegex.test(line);
  }

  removeInlineCode(line: string): string {
    return line.replace(CodeBlockDetector.INLINE_CODE, "");
  }

  filterNonCodeLines(
    lines: string[],
    codeBlocks: CodeBlockRange[],
  ): {
    line: string;
    originalLineNumber: number;
  }[] {
    return lines
      .map((line, index) => ({
        line,
        originalLineNumber: index,
      }))
      .filter(({ originalLineNumber }) => !this.isInCodeBlock(originalLineNumber, codeBlocks));
  }

  getCodeBlockStats(content: string): {
    totalCodeBlocks: number;
    totalCodeLines: number;
    languages: Record<string, number>;
  } {
    const codeBlocks = this.detectCodeBlocks(content);
    const languages: Record<string, number> = {};
    let totalCodeLines = 0;

    for (const block of codeBlocks) {
      const blockLines = block.endLine - block.startLine + 1;
      totalCodeLines += blockLines;

      if (block.language) {
        languages[block.language] = (languages[block.language] || 0) + 1;
      } else {
        languages["unknown"] = (languages["unknown"] || 0) + 1;
      }
    }

    return {
      totalCodeBlocks: codeBlocks.length,
      totalCodeLines,
      languages,
    };
  }
}
