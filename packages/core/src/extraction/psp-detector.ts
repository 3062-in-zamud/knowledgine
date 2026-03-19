import type { ExtractedPattern } from "../types.js";

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
    _problemNote: { id: number; patterns: ExtractedPattern[] },
    _solutionNote: { id: number; patterns: ExtractedPattern[]; createdAt: string },
    _problemNoteCreatedAt: string,
  ): DetectedPair[] {
    // TODO: Implement cross-note detection in future iterations
    return [];
  }
}
