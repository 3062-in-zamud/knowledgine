import type { ExtractedPattern } from "../types.js";
import type { ExtractedEntity } from "../graph/entity-extractor.js";

export type KnowledgeVectorCategory =
  | "personal_info"
  | "preferences"
  | "events"
  | "temporal_data"
  | "updates"
  | "assistant_info";

export interface KnowledgeVector {
  category: KnowledgeVectorCategory;
  content: string;
  confidence: number; // 0-1
  source: "rule" | "llm";
  metadata?: Record<string, unknown>;
}

export interface ObserverOutput {
  noteId: number;
  vectors: KnowledgeVector[];
  patterns: ExtractedPattern[];
  entities: ExtractedEntity[];
  processingMode: "rule" | "hybrid";
  processingTimeMs: number;
  errors?: string[];
}

// Reflector用の型（Phase 3で使用）
export interface ContradictionDetection {
  newVectorIndex: number;
  existingNoteId: number;
  existingContent: string;
  contradictionType: "factual" | "temporal" | "preference_change" | "supersede";
  confidence: number;
  resolution: "deprecate_old" | "deprecate_new" | "merge" | "keep_both";
  reasoning: string;
}

export interface DeprecationCandidate {
  noteId: number;
  reason: string;
  confidence: number;
  contradictions: ContradictionDetection[];
}

export interface ReflectorOutput {
  noteId: number;
  contradictions: ContradictionDetection[];
  deprecationCandidates: DeprecationCandidate[];
  versionUpdates: Array<{
    noteId: number;
    newVersion: number;
    supersedesNoteId: number;
  }>;
  processingMode: "rule" | "hybrid";
  processingTimeMs: number;
}
