/** Core pattern types (4 axes) */
export type PatternType = "problem" | "solution" | "learning" | "time";

/** Extracted pattern from note content */
export interface ExtractedPattern {
  type: PatternType;
  content: string;
  confidence: number;
  context?: string;
  lineNumber?: number;
  contextType?: "section_header" | "list_item" | "body_text" | "code_comment";
}

/** Problem-Solution pair */
export interface ProblemSolutionPair {
  id?: number;
  problemNoteId: number;
  solutionNoteId: number;
  problemPattern: string;
  solutionPattern: string;
  timeDiff?: number;
  confidence: number;
  createdAt: string;
}

/** Link between notes */
export interface NoteLink {
  id?: number;
  sourceNoteId: number;
  targetNoteId: number;
  linkType: "related" | "derived" | "references" | "auto-generated";
  similarity?: number;
  createdAt: string;
}

/** Core knowledge data structure */
export interface KnowledgeData {
  id?: number;
  filePath: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

/** Search result */
export interface SearchResult {
  note: {
    id: number;
    filePath: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  score: number;
  matchReason: string[];
}

/** Semantic search options */
export interface SemanticSearchOptions {
  query: string;
  limit?: number;
  mode?: "keyword" | "semantic" | "hybrid";
}

/** Semantic search result */
export interface SemanticSearchResult {
  noteId: number;
  filePath: string;
  title: string;
  score: number;
  matchReason: string[];
}

// --- Knowledge Graph Types (type definitions only) ---

export type EntityType =
  | "person"
  | "project"
  | "technology"
  | "concept"
  | "tool"
  | "organization"
  | "event";

export type RelationType =
  | "uses"
  | "implements"
  | "depends_on"
  | "related_to"
  | "created_by"
  | "works_on"
  | "solves"
  | "references"
  | "part_of"
  | "similar_to";

export type ObservationType = "fact" | "insight" | "learning" | "decision" | "performance";

export interface Entity {
  id?: number;
  name: string;
  entityType: EntityType;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Relation {
  id?: number;
  fromEntityId: number;
  toEntityId: number;
  relationType: RelationType;
  strength?: number;
  description?: string;
  createdAt: string;
}

export interface Observation {
  id?: number;
  entityId: number;
  content: string;
  observationType: ObservationType;
  confidence?: number;
  sourceNoteId?: number;
  sourcePatternId?: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface EntityWithGraph extends Entity {
  observations: Observation[];
  outgoingRelations: Array<Relation & { targetEntity: Entity }>;
  incomingRelations: Array<Relation & { sourceEntity: Entity }>;
  linkedNotes: Array<{ entityId: number; noteId: number; note: Partial<KnowledgeData> }>;
}

// --- Memory Layer Types ---

export type MemoryLayer = "episodic" | "semantic" | "procedural";

export interface MemoryEntry {
  id?: number;
  noteId?: number;
  layer: MemoryLayer;
  content: string;
  summary?: string;
  accessCount: number;
  lastAccessedAt?: string;
  promotedFrom?: number;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryContext {
  episodic: MemoryEntry[];
  semantic: MemoryEntry[];
  procedural: MemoryEntry[];
}

// --- Event Sourcing Types ---

export type EventType =
  | "git_commit"
  | "pr_opened"
  | "pr_merged"
  | "pr_comment"
  | "issue_created"
  | "issue_closed"
  | "ci_result"
  | "session_start"
  | "session_end"
  | "session_message"
  | "slack_message"
  | "document_change"
  | "task_update"
  | "manual_observation";

export type SourceType =
  | "git"
  | "github"
  | "claude_code"
  | "cursor"
  | "slack"
  | "notion"
  | "markdown"
  | "manual";

export interface KnowledgeEvent {
  id?: number;
  eventType: EventType;
  sourceType: SourceType;
  sourceId?: string;
  sourceUri?: string;
  actor?: string;
  content: string;
  contentHash: string;
  occurredAt: string;
  ingestedAt?: string;
  metadataJson?: Record<string, unknown>;
  projectId?: string;
  sessionId?: string;
}

export interface IngestCursor {
  pluginId: string;
  sourcePath: string;
  checkpoint: string;
  lastIngestAt: string;
  metadataJson?: Record<string, unknown>;
}

// --- Feedback Types ---

export type FeedbackErrorType = "false_positive" | "wrong_type" | "missed_entity";

export type FeedbackStatus = "pending" | "applied" | "dismissed";
