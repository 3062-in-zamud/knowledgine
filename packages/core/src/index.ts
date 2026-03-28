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
export { migration008 } from "./storage/migrations/008_knowledge_versioning.js";
export { migration009 } from "./storage/migrations/009_extraction_metadata.js";
export { migration010 } from "./storage/migrations/010_memory_protocol.js";
export { migration011 } from "./storage/migrations/011_fts_unicode61.js";

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
import { migration008 } from "./storage/migrations/008_knowledge_versioning.js";
import { migration009 } from "./storage/migrations/009_extraction_metadata.js";
import { migration010 } from "./storage/migrations/010_memory_protocol.js";
import { migration011 } from "./storage/migrations/011_fts_unicode61.js";
import { migration012 } from "./storage/migrations/012_fts_trigram_cjk.js";
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
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
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
export { TemporalQueryEngine } from "./graph/temporal-query.js";
export type {
  PointInTimeQuery,
  TemporalQueryResult,
  TemporalTimelineEntry,
} from "./graph/temporal-query.js";

// LLM
export type {
  LLMCompletionMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMProvider,
  OllamaProviderConfig,
  OpenAIProviderConfig,
  LLMProviderType,
  LLMConfig,
} from "./llm/types.js";
export { LLMProviderError } from "./llm/errors.js";
export type { LLMErrorCode } from "./llm/errors.js";
export { OllamaProvider } from "./llm/ollama-provider.js";
export { OpenAICompatibleProvider } from "./llm/openai-provider.js";
export { createLLMProvider } from "./llm/provider-factory.js";

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
export { CausalLinkDetector } from "./extraction/causal-link-detector.js";
export type { CausalLinkSummary } from "./extraction/causal-link-detector.js";
export { IncrementalExtractor } from "./extraction/incremental-extractor.js";
export type { ExtractionSummary } from "./extraction/incremental-extractor.js";
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
export { ReasoningReranker } from "./search/reasoning-reranker.js";
export type {
  RerankInput,
  RerankResult,
  AxisScores,
  RerankOptions,
  RerankerWeights,
  RerankedResult,
} from "./search/reasoning-reranker.js";
export { LocalLinkGenerator } from "./search/link-generator.js";
export type { RelatedNote } from "./search/link-generator.js";
export { classifyQuery, getWeightsForQueryType } from "./search/query-classifier.js";
export type { QueryType, QueryWeights } from "./search/query-classifier.js";
export { QueryOrchestrator } from "./search/query-orchestrator.js";
export type { OrchestratedResult, QueryOrchestratorConfig } from "./search/query-orchestrator.js";

// Processing
export { FileProcessor } from "./processing/file-processor.js";
export type { ProcessedFile } from "./processing/file-processor.js";

// Utils
export { CodeBlockDetector } from "./utils/code-block-detector.js";
export type { CodeBlockRange } from "./utils/code-block-detector.js";
export { checkSemanticReadiness } from "./utils/semantic-readiness.js";
export type { SemanticReadiness } from "./utils/semantic-readiness.js";

// Agents
export type {
  KnowledgeVectorCategory,
  KnowledgeVector,
  ObserverOutput,
  ContradictionDetection,
  DeprecationCandidate,
  ReflectorOutput,
} from "./agents/types.js";
export { ObserverAgent } from "./agents/observer-agent.js";
export type { ObserverAgentConfig, ObserverAgentDeps } from "./agents/observer-agent.js";
export { ReflectorAgent } from "./agents/reflector-agent.js";
export type { ReflectorAgentConfig, ReflectorAgentDeps } from "./agents/reflector-agent.js";
export { classifyByRules, parseLLMVectorResponse } from "./agents/vector-classification-rules.js";

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
