import { realpathSync } from "fs";
import { relative, isAbsolute } from "path";
import type { KnowledgeRepository } from "../storage/knowledge-repository.js";
import type { GraphRepository } from "../graph/graph-repository.js";
import type { FeedbackRepository, FeedbackRecord } from "../feedback/feedback-repository.js";
import type { FeedbackErrorType } from "../types.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import { KnowledgeSearcher } from "../search/knowledge-searcher.js";
import { LocalLinkGenerator } from "../search/link-generator.js";

export interface KnowledgeServiceOptions {
  repository: KnowledgeRepository;
  rootPath?: string;
  embeddingProvider?: EmbeddingProvider;
  graphRepository?: GraphRepository;
  feedbackRepository?: FeedbackRepository;
}

export interface SearchKnowledgeResult {
  query: string;
  mode: "keyword" | "semantic" | "hybrid";
  totalResults: number;
  results: Array<{
    noteId: number;
    filePath: string;
    title: string;
    score: number;
    matchReason: string[];
    createdAt: string;
  }>;
}

export interface FindRelatedResult {
  noteId: number;
  relatedNotes: Array<{
    noteId: number;
    filePath: string;
    title: string;
    score: number;
    reasons: string[];
  }>;
  problemSolutionPairs: Array<{
    id: number;
    problemNoteId: number;
    solutionNoteId: number;
    problemPattern: string;
    solutionPattern: string;
    confidence: number;
  }>;
  graphRelations: Array<{
    entityId: number;
    name: string;
    entityType: string;
    relatedEntities: Array<{
      id: number;
      name: string;
      entityType: string;
      hops: number;
    }>;
  }>;
}

export interface StatsResult {
  totalNotes: number;
  totalPatterns: number;
  totalLinks: number;
  totalPairs: number;
  patternsByType: Record<string, number>;
  embeddingStatus: {
    available: boolean;
    notesWithoutEmbeddings: number | null;
  };
  graphStats: {
    totalEntities: number;
    totalRelations: number;
    totalObservations: number;
    entitiesByType: Record<string, number>;
    relationsByType: Record<string, number>;
  } | null;
}

export interface SearchEntitiesResult {
  query: string;
  totalResults: number;
  entities: Array<{
    id: number;
    name: string;
    entityType: string;
    description?: string;
    createdAt: string;
  }>;
}

export interface ReportErrorResult {
  message: string;
  feedback: FeedbackRecord;
}

export interface SearchInput {
  query: string;
  limit?: number;
  mode?: "keyword" | "semantic" | "hybrid";
}

export interface FindRelatedInput {
  noteId?: number;
  filePath?: string;
  limit?: number;
  maxHops?: number;
}

export interface SearchEntitiesInput {
  query: string;
  limit?: number;
}

export interface GetEntityGraphInput {
  entityId?: number;
  entityName?: string;
}

export interface ReportErrorInput {
  entityName: string;
  errorType: FeedbackErrorType;
  entityType?: string;
  correctType?: string;
  noteId?: number;
  details?: string;
}

export class KnowledgeService {
  private searcher: KnowledgeSearcher;
  private linkGenerator: LocalLinkGenerator;

  constructor(private options: KnowledgeServiceOptions) {
    this.searcher = new KnowledgeSearcher(options.repository, options.embeddingProvider);
    this.linkGenerator = new LocalLinkGenerator(options.repository, options.graphRepository);
  }

  async search(input: SearchInput): Promise<SearchKnowledgeResult> {
    const { query, limit = 20, mode = "keyword" } = input;
    const results = await this.searcher.search({ query, limit, mode });
    return {
      query,
      mode,
      totalResults: results.length,
      results: results.map((r) => ({
        noteId: r.note.id,
        filePath: r.note.file_path,
        title: r.note.title,
        score: r.score,
        matchReason: r.matchReason,
        createdAt: r.note.created_at,
      })),
    };
  }

  async findRelated(input: FindRelatedInput): Promise<FindRelatedResult> {
    const { limit = 5, maxHops = 1 } = input;
    let resolvedNoteId = input.noteId;

    if (!resolvedNoteId && input.filePath) {
      let normalizedPath = input.filePath;
      if (this.options.rootPath && isAbsolute(normalizedPath)) {
        normalizedPath = relative(this.options.rootPath, normalizedPath);
      }
      // パストラバーサル保護
      if (normalizedPath.startsWith("..") || isAbsolute(normalizedPath)) {
        throw new Error("Invalid file path: outside of root directory");
      }
      const note = this.options.repository.getNoteByPath(normalizedPath);
      if (!note) {
        throw new Error(`Note not found for path: ${input.filePath}`);
      }
      resolvedNoteId = note.id;
    }

    if (!resolvedNoteId) {
      throw new Error("Either noteId or filePath is required");
    }

    const relatedNotes = this.linkGenerator.findRelatedNotes(resolvedNoteId, limit);
    const problemSolutionPairs = this.options.repository.getProblemSolutionPairsByNoteId(resolvedNoteId);

    let graphRelations: FindRelatedResult["graphRelations"] = [];
    if (this.options.graphRepository) {
      const linkedEntities = this.options.graphRepository.getLinkedEntities(resolvedNoteId);
      graphRelations = linkedEntities.map((entity) => ({
        entityId: entity.id!,
        name: entity.name,
        entityType: entity.entityType,
        relatedEntities: this.options.graphRepository!.findRelatedEntities(entity.id!, maxHops).map((e) => ({
          id: e.id!,
          name: e.name,
          entityType: e.entityType,
          hops: e.hops,
        })),
      }));
    }

    return {
      noteId: resolvedNoteId,
      relatedNotes: relatedNotes.map((n) => ({
        noteId: n.id,
        filePath: n.filePath,
        title: n.title,
        score: n.similarity,
        reasons: [n.reason],
      })),
      problemSolutionPairs: problemSolutionPairs.map((p) => ({
        id: p.id ?? 0,
        problemNoteId: p.problemNoteId,
        solutionNoteId: p.solutionNoteId,
        problemPattern: p.problemPattern,
        solutionPattern: p.solutionPattern,
        confidence: p.confidence,
      })),
      graphRelations,
    };
  }

  getStats(): StatsResult {
    const stats = this.options.repository.getStats();
    const notesWithoutEmbeddings = this.options.embeddingProvider
      ? this.options.repository.getNotesWithoutEmbeddings().length
      : null;
    const graphStats = this.options.graphRepository
      ? this.options.graphRepository.getGraphStats()
      : null;

    return {
      ...stats,
      embeddingStatus: {
        available: this.options.embeddingProvider != null,
        notesWithoutEmbeddings,
      },
      graphStats,
    };
  }

  searchEntities(input: SearchEntitiesInput): SearchEntitiesResult {
    if (!this.options.graphRepository) {
      return { query: input.query, totalResults: 0, entities: [] };
    }
    const entities = this.options.graphRepository.searchEntities(input.query, input.limit ?? 20);
    return {
      query: input.query,
      totalResults: entities.length,
      entities: entities.map((e) => ({
        id: e.id!,
        name: e.name,
        entityType: e.entityType,
        description: e.description,
        createdAt: e.createdAt,
      })),
    };
  }

  getEntityGraph(input: GetEntityGraphInput): import("../types.js").EntityWithGraph | undefined {
    if (!this.options.graphRepository) {
      return undefined;
    }
    let entityId = input.entityId;
    if (!entityId && input.entityName) {
      const entity = this.options.graphRepository.getEntityByName(input.entityName);
      if (!entity) {
        return undefined;
      }
      entityId = entity.id;
    }
    if (!entityId) {
      return undefined;
    }
    return this.options.graphRepository.getEntityWithGraph(entityId);
  }

  reportExtractionError(input: ReportErrorInput): ReportErrorResult {
    if (!this.options.feedbackRepository) {
      throw new Error("Feedback system is not available.");
    }
    const record = this.options.feedbackRepository.create({
      entityName: input.entityName,
      errorType: input.errorType,
      entityType: input.entityType,
      correctType: input.correctType,
      noteId: input.noteId,
      details: input.details,
    });
    return {
      message: "Feedback recorded successfully",
      feedback: record,
    };
  }

  private validateFilePath(inputPath: string): string {
    if (!this.options.rootPath) throw new Error("rootPath is required for file path resolution");
    const resolved = realpathSync(inputPath);
    const rootResolved = realpathSync(this.options.rootPath);
    if (!resolved.startsWith(rootResolved + "/") && resolved !== rootResolved) {
      throw new Error("Invalid file path: outside of root directory");
    }
    return relative(rootResolved, resolved);
  }
}
