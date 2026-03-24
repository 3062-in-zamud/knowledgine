import type { ExtractedPattern } from "../types.js";

/**
 * 2つのテキスト間のキーワード重複率（Jaccard係数ベース）を計算する
 */
function keywordOverlap(a: string, b: string): number {
  const tokenize = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 2),
    );

  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DetectedPair {
  problemNoteId: number;
  solutionNoteId: number;
  problemPattern: string;
  solutionPattern: string;
  timeDiff?: number;
  confidence: number;
}

export class ProblemSolutionDetector {
  detectPairsInNote(
    noteId: number,
    patterns: Array<{ id: number; pattern_type: string; content: string }>,
    classifications: Array<{ patternId: number; category: string; confidence: number }>,
  ): DetectedPair[] {
    const pairs: DetectedPair[] = [];

    const classificationMap = new Map<number, Array<{ category: string; confidence: number }>>();
    for (const classification of classifications) {
      if (!classificationMap.has(classification.patternId)) {
        classificationMap.set(classification.patternId, []);
      }
      classificationMap.get(classification.patternId)!.push({
        category: classification.category,
        confidence: classification.confidence,
      });
    }

    const problems: Array<{ id: number; content: string; confidence: number }> = [];
    const solutions: Array<{ id: number; content: string; confidence: number }> = [];

    for (const pattern of patterns) {
      const patternClassifications = classificationMap.get(pattern.id);
      if (!patternClassifications) continue;

      for (const c of patternClassifications) {
        if (c.category === "recurring_error") {
          problems.push({ id: pattern.id, content: pattern.content, confidence: c.confidence });
        } else if (c.category === "solution_found") {
          solutions.push({ id: pattern.id, content: pattern.content, confidence: c.confidence });
        }
      }
    }

    for (const problem of problems) {
      for (const solution of solutions) {
        if (solution.id > problem.id) {
          pairs.push({
            problemNoteId: noteId,
            solutionNoteId: noteId,
            problemPattern: problem.content,
            solutionPattern: solution.content,
            confidence: Math.min(problem.confidence, solution.confidence),
          });
        }
      }
    }

    return pairs;
  }

  detectPairsAcrossNotes(
    problemNote: { id: number; patterns: ExtractedPattern[] },
    solutionNote: { id: number; patterns: ExtractedPattern[]; createdAt: string },
    problemNoteCreatedAt: string,
  ): DetectedPair[] {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const MAX_TIME_DIFF_DAYS = 30;
    const MIN_KEYWORD_OVERLAP = 0.3;

    const timeDiff =
      (new Date(solutionNote.createdAt).getTime() - new Date(problemNoteCreatedAt).getTime()) /
      MS_PER_DAY;

    // solution must come after problem and within time window
    if (timeDiff < 0 || timeDiff > MAX_TIME_DIFF_DAYS) return [];

    const problems = problemNote.patterns.filter((p) => p.type === "problem");
    const solutions = solutionNote.patterns.filter((p) => p.type === "solution");

    if (problems.length === 0 || solutions.length === 0) return [];

    const pairs: DetectedPair[] = [];

    for (const problem of problems) {
      for (const solution of solutions) {
        const overlap = keywordOverlap(problem.content, solution.content);
        if (overlap < MIN_KEYWORD_OVERLAP) continue;

        const confidence = overlap;

        pairs.push({
          problemNoteId: problemNote.id,
          solutionNoteId: solutionNote.id,
          problemPattern: problem.content,
          solutionPattern: solution.content,
          timeDiff,
          confidence,
        });
      }
    }

    return pairs;
  }
}
