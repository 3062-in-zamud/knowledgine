// Minimal in-memory MemoryProvider — ~50 lines of effective code.
// Implements the four required operations (store / recall / update / forget)
// plus the `versioning` capability so the conformance suite has a working
// chain to validate. No persistence, no concurrency control: not for real use.

import type {
  MemoryProvider,
  MemoryProviderCapabilities,
  MemoryStoreRequest,
  MemoryStoreResponse,
  MemoryRecallRequest,
  MemoryRecallResponse,
  MemoryUpdateRequest,
  MemoryUpdateResponse,
  MemoryForgetRequest,
  MemoryForgetResponse,
  RecalledMemory,
  MemoryLayer,
} from "@knowledgine/mcp-memory-protocol";
import { invalidContent, invalidLayer, memoryNotFound } from "@knowledgine/mcp-memory-protocol";

const LAYERS: readonly MemoryLayer[] = ["episodic", "semantic", "procedural"];

interface Row {
  id: string;
  content: string;
  layer: MemoryLayer;
  version: number;
  accessCount: number;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  deprecated: boolean;
  deprecationReason?: string;
  supersedes?: string;
  validFrom: string;
  hardDeleted?: boolean;
}

export class MinimalInMemoryProvider implements MemoryProvider {
  private rows = new Map<string, Row>();
  private nextId = 1;

  capabilities(): MemoryProviderCapabilities {
    return {
      versioning: true,
      semanticSearch: false,
      layerPromotion: false,
      temporalQuery: false,
      ttl: false,
      supportedLayers: [...LAYERS],
    };
  }

  async store(req: MemoryStoreRequest): Promise<MemoryStoreResponse> {
    if (!req.content?.trim()) throw invalidContent();
    const layer: MemoryLayer = req.layer ?? "episodic";
    if (!LAYERS.includes(layer)) throw invalidLayer(String(layer));
    const id = String(this.nextId++);
    const now = new Date().toISOString();
    this.rows.set(id, {
      id,
      content: req.content,
      layer,
      version: 1,
      accessCount: 0,
      tags: req.tags ? [...req.tags] : [],
      metadata: req.metadata ? { ...req.metadata } : undefined,
      createdAt: now,
      validFrom: now,
      deprecated: false,
    });
    return { id, layer, version: 1, createdAt: now };
  }

  async recall(req: MemoryRecallRequest): Promise<MemoryRecallResponse> {
    // Spec §5.2: limit defaults to 10 and is capped at 100.
    const limit = Math.min(Math.max(req.limit ?? 10, 1), 100);
    const includeHistory = req.includeVersionHistory === true;
    const live = [...this.rows.values()].filter((r) => !r.hardDeleted);
    let cands = includeHistory ? live : live.filter((r) => !r.deprecated);
    if (req.filter?.memoryIds?.length) {
      const want = new Set(req.filter.memoryIds);
      cands = cands.filter((r) => want.has(r.id));
    }
    if (req.filter?.layer) cands = cands.filter((r) => r.layer === req.filter!.layer);
    if (req.filter?.tags?.length) {
      cands = cands.filter((r) => req.filter!.tags!.every((t) => r.tags.includes(t)));
    }
    if (req.filter?.createdAfter) {
      cands = cands.filter((r) => r.createdAt >= req.filter!.createdAfter!);
    }
    if (req.filter?.createdBefore) {
      cands = cands.filter((r) => r.createdAt <= req.filter!.createdBefore!);
    }
    if (req.query) {
      const q = req.query.toLowerCase();
      cands = cands.filter((r) => r.content.toLowerCase().includes(q));
    }
    const totalCount = cands.length;
    const sliced = cands.slice(0, limit);
    const now = new Date().toISOString();
    for (const r of sliced) {
      r.accessCount += 1;
      r.updatedAt = now;
    }
    return { memories: sliced.map(toRecalled), totalCount, hasMore: totalCount > sliced.length };
  }

  async update(req: MemoryUpdateRequest): Promise<MemoryUpdateResponse> {
    const row = this.rows.get(req.id);
    if (!row || row.hardDeleted) throw memoryNotFound(req.id);
    if (req.content !== undefined && !req.content.trim()) throw invalidContent();
    const now = new Date().toISOString();
    const createVersion = req.createVersion ?? true;
    if (!createVersion) {
      if (req.content !== undefined) row.content = req.content;
      if (req.tags !== undefined) row.tags = [...req.tags];
      if (req.metadata !== undefined) row.metadata = { ...(row.metadata ?? {}), ...req.metadata };
      row.version += 1;
      row.updatedAt = now;
      return { id: row.id, version: row.version, updatedAt: now };
    }
    row.deprecated = true;
    row.deprecationReason = "superseded by new version";
    row.updatedAt = now;
    const newId = String(this.nextId++);
    this.rows.set(newId, {
      id: newId,
      content: req.content ?? row.content,
      layer: row.layer,
      version: row.version + 1,
      accessCount: 0,
      tags: req.tags ? [...req.tags] : [...row.tags],
      metadata: req.metadata ? { ...(row.metadata ?? {}), ...req.metadata } : row.metadata,
      createdAt: now,
      validFrom: now,
      deprecated: false,
      supersedes: row.id,
    });
    return { id: newId, version: row.version + 1, previousVersion: row.version, updatedAt: now };
  }

  async forget(req: MemoryForgetRequest): Promise<MemoryForgetResponse> {
    const row = this.rows.get(req.id);
    if (!row || row.hardDeleted) throw memoryNotFound(req.id);
    if (req.hard === true) {
      row.hardDeleted = true;
      return { id: req.id, forgotten: true, method: "hard" };
    }
    row.deprecated = true;
    row.deprecationReason = req.reason ?? "forgotten";
    row.updatedAt = new Date().toISOString();
    return { id: req.id, forgotten: true, method: "soft" };
  }
}

function toRecalled(r: Row): RecalledMemory {
  return {
    id: r.id,
    content: r.content,
    layer: r.layer,
    version: r.version,
    accessCount: r.accessCount,
    tags: [...r.tags],
    metadata: r.metadata ? { ...r.metadata } : undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deprecated: r.deprecated,
    deprecationReason: r.deprecationReason,
    supersedes: r.supersedes,
    validFrom: r.validFrom,
  };
}
