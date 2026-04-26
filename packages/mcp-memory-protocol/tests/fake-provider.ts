// In-memory MemoryProvider for conformance smoke tests.
// PR 2 coverage: versioning capability is implemented end-to-end so the
// versioning test-suite executes. ttl / temporalQuery / semanticSearch /
// layerPromotion remain false in this PR — PR 3 adds their test-suites
// and corresponding implementation in the knowledgine adapter.

import type {
  MemoryForgetRequest,
  MemoryForgetResponse,
  MemoryProvider,
  MemoryProviderCapabilities,
  MemoryRecallRequest,
  MemoryRecallResponse,
  MemoryStoreRequest,
  MemoryStoreResponse,
  MemoryUpdateRequest,
  MemoryUpdateResponse,
  MemoryLayer,
  RecalledMemory,
} from "../src/index.js";
import { invalidContent, invalidLayer, memoryNotFound } from "../src/index.js";

interface Entry {
  id: string;
  content: string;
  summary?: string;
  layer: MemoryLayer;
  version: number;
  accessCount: number;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  lastAccessedAt?: string;
  deprecated: boolean;
  deprecationReason?: string;
  supersedes?: string;
  validFrom: string;
  /** Hard-deleted entries are removed from the map outright; soft-deleted
   * entries set `deprecated = true` and `deletedAt`. */
  deletedAt?: string;
}

const VALID_LAYERS: readonly MemoryLayer[] = ["episodic", "semantic", "procedural"];

export class FakeInMemoryProvider implements MemoryProvider {
  private readonly entries = new Map<string, Entry>();
  private nextId = 1;

  capabilities(): MemoryProviderCapabilities {
    return {
      versioning: true,
      semanticSearch: false,
      layerPromotion: false,
      temporalQuery: false,
      ttl: false,
      supportedLayers: ["episodic", "semantic", "procedural"],
    };
  }

  async store(request: MemoryStoreRequest): Promise<MemoryStoreResponse> {
    if (!request.content || request.content.trim() === "") {
      throw invalidContent();
    }
    const layer: MemoryLayer = request.layer ?? "episodic";
    if (!VALID_LAYERS.includes(layer)) {
      throw invalidLayer(String(layer));
    }
    const id = String(this.nextId++);
    const now = new Date().toISOString();
    const entry: Entry = {
      id,
      content: request.content,
      layer,
      version: 1,
      accessCount: 0,
      tags: request.tags ? [...request.tags] : [],
      metadata: request.metadata ? { ...request.metadata } : undefined,
      createdAt: now,
      validFrom: now,
      deprecated: false,
    };
    this.entries.set(id, entry);
    return { id, layer, version: 1, createdAt: now };
  }

  async recall(request: MemoryRecallRequest): Promise<MemoryRecallResponse> {
    if (request.asOf !== undefined) {
      // PR 3 will add temporal_query support to the knowledgine adapter; the
      // fake provider declares the capability false so this path is not
      // exercised by the conformance suite.
      return { memories: [], totalCount: 0, hasMore: false };
    }

    const includeHistory = request.includeVersionHistory === true;
    const filter = request.filter;
    const limit = request.limit ?? 10;
    const query = request.query?.toLowerCase();

    let candidates = Array.from(this.entries.values());

    if (!includeHistory) {
      candidates = candidates.filter((e) => !e.deprecated);
    }
    if (filter?.memoryIds && filter.memoryIds.length > 0) {
      candidates = candidates.filter((e) => filter.memoryIds!.includes(e.id));
    }
    if (filter?.layer) {
      candidates = candidates.filter((e) => e.layer === filter.layer);
    }
    if (filter?.tags && filter.tags.length > 0) {
      candidates = candidates.filter((e) => filter.tags!.every((t) => e.tags.includes(t)));
    }
    if (filter?.createdAfter) {
      candidates = candidates.filter((e) => e.createdAt >= filter.createdAfter!);
    }
    if (filter?.createdBefore) {
      candidates = candidates.filter((e) => e.createdAt <= filter.createdBefore!);
    }
    if (query) {
      candidates = candidates.filter((e) => e.content.toLowerCase().includes(query));
    }

    const totalCount = candidates.length;
    const sliced = candidates.slice(0, limit);

    // Increment access counters for returned entries (SHOULD).
    const now = new Date().toISOString();
    for (const e of sliced) {
      e.accessCount += 1;
      e.lastAccessedAt = now;
    }

    return {
      memories: sliced.map(toRecalled),
      totalCount,
      hasMore: totalCount > sliced.length,
    };
  }

  async update(request: MemoryUpdateRequest): Promise<MemoryUpdateResponse> {
    const entry = this.entries.get(request.id);
    if (!entry || entry.deletedAt !== undefined) {
      throw memoryNotFound(request.id);
    }
    const createVersion = request.createVersion ?? true;
    const now = new Date().toISOString();

    if (!createVersion) {
      if (request.content !== undefined) {
        if (!request.content || request.content.trim() === "") {
          throw invalidContent();
        }
        entry.content = request.content;
      }
      if (request.summary !== undefined) entry.summary = request.summary;
      if (request.tags !== undefined) entry.tags = [...request.tags];
      if (request.metadata !== undefined) {
        entry.metadata = { ...(entry.metadata ?? {}), ...request.metadata };
      }
      entry.updatedAt = now;
      entry.version += 1;
      return { id: entry.id, version: entry.version, updatedAt: now };
    }

    // Versioned update: deprecate old, create new entry that supersedes it.
    entry.deprecated = true;
    entry.deprecationReason = "superseded by new version";
    entry.updatedAt = now;

    const newId = String(this.nextId++);
    const newEntry: Entry = {
      id: newId,
      content: request.content ?? entry.content,
      summary: request.summary ?? entry.summary,
      layer: entry.layer,
      version: entry.version + 1,
      accessCount: 0,
      tags: request.tags ?? [...entry.tags],
      metadata: request.metadata
        ? { ...(entry.metadata ?? {}), ...request.metadata }
        : entry.metadata
          ? { ...entry.metadata }
          : undefined,
      createdAt: now,
      validFrom: now,
      deprecated: false,
      supersedes: entry.id,
    };
    this.entries.set(newId, newEntry);

    return {
      id: newId,
      version: newEntry.version,
      previousVersion: entry.version,
      updatedAt: now,
    };
  }

  async forget(request: MemoryForgetRequest): Promise<MemoryForgetResponse> {
    const entry = this.entries.get(request.id);
    if (!entry) {
      throw memoryNotFound(request.id);
    }
    if (request.hard === true) {
      this.entries.delete(request.id);
      return { id: request.id, forgotten: true, method: "hard" };
    }
    const now = new Date().toISOString();
    entry.deprecated = true;
    entry.deprecationReason = request.reason ?? "forgotten";
    entry.deletedAt = now;
    entry.updatedAt = now;
    return { id: request.id, forgotten: true, method: "soft" };
  }
}

function toRecalled(e: Entry): RecalledMemory {
  return {
    id: e.id,
    content: e.content,
    summary: e.summary,
    layer: e.layer,
    version: e.version,
    accessCount: e.accessCount,
    tags: [...e.tags],
    metadata: e.metadata ? { ...e.metadata } : undefined,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    lastAccessedAt: e.lastAccessedAt,
    deprecated: e.deprecated,
    deprecationReason: e.deprecationReason,
    supersedes: e.supersedes,
    validFrom: e.validFrom,
  };
}
