import { createRequire } from "module";
const _require = createRequire(import.meta.url);
export const VERSION: string = _require("../package.json").version;

// Config
export { defineConfig } from "./config.js";
export type {
  KnowledgineConfig,
  PatternCategory,
  EmbeddingConfig,
  SearchConfig,
} from "./config.js";

// Types
export type {
  PatternType,
  ExtractedPattern,
  ProblemSolutionPair,
  NoteLink,
  KnowledgeData,
  SearchResult,
  EntityType,
  RelationType,
  ObservationType,
  Entity,
  Relation,
  Observation,
  EntityWithGraph,
  MemoryLayer,
  MemoryEntry,
  MemoryContext,
  EventType,
  SourceType,
  KnowledgeEvent,
  IngestCursor,
  FeedbackErrorType,
  FeedbackStatus,
} from "./types.js";

// Errors
export {
  KnowledgeError,
  KnowledgeNotFoundError,
  FTSIndexError,
  ValidationError,
  DatabaseError,
  ClassificationError,
  LinkGenerationError,
  MemoryNotFoundError,
  MemoryPromotionError,
  MemoryDemotionError,
  EmbeddingNotAvailableError,
  VectorExtensionError,
  EmbeddingError,
} from "./errors.js";

// Config loader
export { loadConfig, writeRcConfig, resolveDefaultPath } from "./config/config-loader.js";
export type { RcConfig } from "./config/config-loader.js";

// Storage
export { createDatabase, loadSqliteVecExtension } from "./storage/database.js";
export { KnowledgeRepository } from "./storage/knowledge-repository.js";
export type { KnowledgeNote, ExtractedPatternRow } from "./storage/knowledge-repository.js";
export { Migrator } from "./storage/migrator.js";
export type { Migration, MigrationStatus } from "./storage/migrator.js";
export { SCHEMA_SQL } from "./storage/schema.js";
export { migration001 } from "./storage/migrations/001_initial.js";
export { migration002 } from "./storage/migrations/002_memory_layers.js";
export { migration003 } from "./storage/migrations/003_vector_embeddings.js";
export { migration004 } from "./storage/migrations/004_knowledge_graph.js";
export { migration005a } from "./storage/migrations/005a_events_layer.js";
export { migration006 } from "./storage/migrations/006_extraction_feedback.js";
export { migration005b } from "./storage/migrations/005b_bitemporal.js";
export { migration005c } from "./storage/migrations/005c_provenance.js";
export { migration007 } from "./storage/migrations/007_spec_alignment.js";

// Feedback
export { FeedbackRepository } from "./feedback/feedback-repository.js";
export type { CreateFeedbackInput, FeedbackRecord } from "./feedback/feedback-repository.js";
export { FeedbackLearner } from "./feedback/feedback-learner.js";
export type { ExtractionRules, TypeOverride, WhitelistEntry } from "./feedback/feedback-learner.js";

// Memory
export { MemoryManager } from "./memory/memory-manager.js";

// Migration convenience array
import { migration001 } from "./storage/migrations/001_initial.js";
import { migration002 } from "./storage/migrations/002_memory_layers.js";
import { migration003 } from "./storage/migrations/003_vector_embeddings.js";
import { migration004 } from "./storage/migrations/004_knowledge_graph.js";
import { migration005a } from "./storage/migrations/005a_events_layer.js";
import { migration005b } from "./storage/migrations/005b_bitemporal.js";
import { migration005c } from "./storage/migrations/005c_provenance.js";
import { migration006 } from "./storage/migrations/006_extraction_feedback.js";
import { migration007 } from "./storage/migrations/007_spec_alignment.js";
import type { Migration } from "./storage/migrator.js";
export const ALL_MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005a,
  migration006,
  migration005b,
  migration005c,
  migration007,
];

// Provenance
export { ProvenanceRepository } from "./provenance/provenance-repository.js";
export type {
  ProvenanceRecord,
  ProvenanceLink,
  FileTimelineEntry,
  Snapshot,
} from "./provenance/provenance-repository.js";

// Graph
export { GraphRepository } from "./graph/graph-repository.js";
export { EntityExtractor } from "./graph/entity-extractor.js";
export type { ExtractedEntity } from "./graph/entity-extractor.js";
export { RelationInferrer } from "./graph/relation-inferrer.js";
export type { InferredRelation } from "./graph/relation-inferrer.js";

// Embedding
export type { EmbeddingProvider } from "./embedding/embedding-provider.js";
export { OnnxEmbeddingProvider } from "./embedding/onnx-embedding-provider.js";
export { ModelManager, DEFAULT_MODEL_NAME } from "./embedding/model-manager.js";
export { downloadModel, MODEL_FILES } from "./embedding/model-downloader.js";
export type { DownloadProgress, DownloadOptions, ModelFile } from "./embedding/model-downloader.js";

// Search (semantic)
export { SemanticSearcher } from "./search/semantic-searcher.js";
export { HybridSearcher } from "./search/hybrid-searcher.js";

// Extraction
export { PatternExtractor } from "./extraction/pattern-extractor.js";
export { ProblemSolutionDetector } from "./extraction/psp-detector.js";
export type { DetectedPair } from "./extraction/psp-detector.js";
export { RuleBasedClassifier } from "./extraction/rule-based-classifier.js";
export type { ClassificationResult } from "./extraction/rule-based-classifier.js";
export { ContextAnalyzer, ContextType } from "./extraction/context-analyzer.js";
export type { LineContext } from "./extraction/context-analyzer.js";
export { DEFAULT_PATTERNS } from "./extraction/default-patterns.js";
export type {
  PatternConfig,
  PatternRule,
  ClassificationRule,
} from "./extraction/default-patterns.js";

// Search
export { KnowledgeSearcher } from "./search/knowledge-searcher.js";
export type { SearchOptions } from "./search/knowledge-searcher.js";
export { LocalLinkGenerator } from "./search/link-generator.js";
export type { RelatedNote } from "./search/link-generator.js";

// Processing
export { FileProcessor } from "./processing/file-processor.js";
export type { ProcessedFile } from "./processing/file-processor.js";

// Utils
export { CodeBlockDetector } from "./utils/code-block-detector.js";
export type { CodeBlockRange } from "./utils/code-block-detector.js";

// Services
export { KnowledgeService } from "./services/knowledge-service.js";
export type {
  KnowledgeServiceOptions,
  SearchKnowledgeResult,
  FindRelatedResult,
  StatsResult,
  SearchEntitiesResult,
  ReportErrorResult,
  SearchInput,
  FindRelatedInput,
  SearchEntitiesInput,
  GetEntityGraphInput,
  ReportErrorInput,
} from "./services/knowledge-service.js";
