import type { KnowledgineConfig } from "../config.js";
import type { ModelManager } from "../embedding/model-manager.js";
import type { KnowledgeRepository } from "../storage/knowledge-repository.js";

export interface SemanticReadiness {
  ready: boolean;
  modelAvailable: boolean;
  configEnabled: boolean;
  embeddingsCount: number;
  totalNotes: number;
  embeddingCoverage: number;
  label: string;
}

export function checkSemanticReadiness(
  config: KnowledgineConfig,
  modelManager: ModelManager,
  repository: KnowledgeRepository,
): SemanticReadiness {
  const stats = repository.getStats();
  const totalNotes = stats.totalNotes;
  const notesWithoutEmbeddings = repository.getNotesWithoutEmbeddingIds().length;
  const embeddingsCount = totalNotes - notesWithoutEmbeddings;
  const modelAvailable = modelManager.isModelAvailable();
  const configEnabled = config.embedding.enabled;

  const embeddingCoverage = totalNotes > 0 ? Math.round((embeddingsCount / totalNotes) * 100) : 0;

  // Semantic ready only when embeddings actually exist (not just model available)
  const ready = configEnabled && modelAvailable && embeddingsCount > 0;

  let label: string;
  if (totalNotes === 0) {
    label = "Not initialized";
  } else if (!configEnabled) {
    label = "FTS5 only — embedding disabled in config";
  } else if (!modelAvailable) {
    label = "FTS5 only — run 'upgrade --semantic' to enable";
  } else if (embeddingsCount === 0) {
    label = "FTS5 only — run 'ingest --all' to generate embeddings";
  } else if (embeddingsCount < totalNotes) {
    label = `Ready (semantic: ${embeddingCoverage}% coverage + FTS5)`;
  } else {
    // embeddingsCount === totalNotes && totalNotes > 0
    label = "Ready (semantic + FTS5)";
  }

  return {
    ready,
    modelAvailable,
    configEnabled,
    embeddingsCount,
    totalNotes,
    embeddingCoverage,
    label,
  };
}
