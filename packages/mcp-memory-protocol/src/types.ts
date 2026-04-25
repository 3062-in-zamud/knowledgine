// Protocol type definitions — MCP Memory Protocol Specification compliant

export type MemoryLayer = "episodic" | "semantic" | "procedural";

export interface MemoryMetadata {
  source?: string | null;
  project?: string | null;
  sessionId?: string | null;
  confidence?: number | null;
  [key: string]: unknown;
}

// --- store_memory ---

export interface MemoryStoreRequest {
  content: string;
  layer?: MemoryLayer;
  metadata?: MemoryMetadata;
  tags?: string[];
  ttl?: number;
}

export interface MemoryStoreResponse {
  id: string;
  layer: MemoryLayer;
  version: number;
  createdAt: string;
}

// --- recall_memory ---

export interface RecallFilter {
  layer?: MemoryLayer;
  tags?: string[];
  createdAfter?: string;
  createdBefore?: string;
  memoryIds?: string[];
}

export interface MemoryRecallRequest {
  query?: string;
  filter?: RecallFilter;
  limit?: number;
  asOf?: string;
  includeVersionHistory?: boolean;
}

export interface RecalledMemory {
  id: string;
  content: string;
  summary?: string;
  layer: MemoryLayer;
  version: number;
  relevanceScore?: number;
  accessCount: number;
  tags: string[];
  metadata?: MemoryMetadata;
  createdAt: string;
  updatedAt?: string;
  lastAccessedAt?: string;
  /** Soft-forget flag (Section 6.1). True when the entry has been deprecated via forget_memory(soft) or update_memory(createVersion: true). */
  deprecated: boolean;
  /** Reason recorded at deprecation time (forget_memory.reason or update_memory rationale). */
  deprecationReason?: string;
  /** Id of the previous version this entry supersedes, when versioning capability is in use. */
  supersedes?: string;
  /** Time at which this version became valid. Equals createdAt for v1, equals new row's createdAt for subsequent versions. */
  validFrom: string;
}

export interface MemoryRecallResponse {
  memories: RecalledMemory[];
  totalCount: number;
  hasMore: boolean;
}

// --- update_memory ---

export interface MemoryUpdateRequest {
  id: string;
  content?: string;
  summary?: string;
  tags?: string[];
  metadata?: Partial<MemoryMetadata>;
  createVersion?: boolean;
}

export interface MemoryUpdateResponse {
  id: string;
  version: number;
  previousVersion?: number;
  updatedAt: string;
}

// --- forget_memory ---

export interface MemoryForgetRequest {
  id: string;
  reason?: string;
  hard?: boolean;
}

export interface MemoryForgetResponse {
  id: string;
  forgotten: boolean;
  method: "soft" | "hard";
}

// --- MemoryEntry (Section 6.1) ---

export interface MemoryEntry {
  id: string;
  layer: MemoryLayer;
  content: string;
  summary?: string | null;
  accessCount: number;
  lastAccessedAt?: string | null;
  tags: string[];
  metadata?: MemoryMetadata | null;
  createdAt: string;
  updatedAt?: string | null;
  version: number;
  supersedes?: string | null;
  validFrom?: string | null;
  deprecated: boolean;
  deprecationReason?: string | null;
}

// --- VersionInfo (Section 6.4) ---

export interface VersionInfo {
  version: number;
  id: string;
  supersedes?: string | null;
  validFrom: string;
  deprecated: boolean;
  deprecationReason?: string | null;
}

// --- MemoryProvider capabilities ---

export interface MemoryProviderCapabilities {
  versioning: boolean;
  semanticSearch: boolean;
  layerPromotion: boolean;
  temporalQuery: boolean;
  ttl: boolean;
  supportedLayers: MemoryLayer[];
}
