import type { KnowledgineConfig } from "../config.js";
import type { ModelManager } from "../embedding/model-manager.js";
import type { KnowledgeRepository } from "../storage/knowledge-repository.js";

export interface SemanticReadiness {
  ready: boolean;
  modelAvailable: boolean;
  configEnabled: boolean;
  embeddingsCount: number;
  totalNotes: number;
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
  const ready = configEnabled && modelAvailable && embeddingsCount > 0;

  let label: string;
  if (totalNotes === 0) {
    label = "Not initialized";
  } else if (ready) {
    label = "Ready (semantic + FTS5)";
  } else {
    label = "Ready (FTS5 only)";
  }

  return { ready, modelAvailable, configEnabled, embeddingsCount, totalNotes, label };
}
