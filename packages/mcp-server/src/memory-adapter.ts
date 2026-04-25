import type { MemoryManager } from "@knowledgine/core";
import type { MemoryLayer as CoreMemoryLayer } from "@knowledgine/core";
import type {
  MemoryProvider,
  MemoryStoreRequest,
  MemoryStoreResponse,
  MemoryRecallRequest,
  MemoryRecallResponse,
  MemoryUpdateRequest,
  MemoryUpdateResponse,
  MemoryForgetRequest,
  MemoryForgetResponse,
  MemoryProviderCapabilities,
  RecalledMemory,
} from "@knowledgine/mcp-memory-protocol";
import {
  memoryNotFound,
  invalidContent,
  invalidLayer,
  capabilityNotSupported,
} from "@knowledgine/mcp-memory-protocol";
import type Database from "better-sqlite3";

const VALID_LAYERS = ["episodic", "semantic", "procedural"] as const;
const DEFAULT_LAYER: CoreMemoryLayer = "episodic";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

interface MemoryEntryRow {
  id: number;
  layer: string;
  content: string;
  summary: string | null;
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string | null;
  metadata_json: string | null;
  tags_json: string | null;
  deleted: number;
  deleted_at: string | null;
  delete_reason: string | null;
  version: number | null;
  supersedes: number | null;
  valid_from: string | null;
  deprecation_reason: string | null;
}

function rowToRecalled(row: MemoryEntryRow): RecalledMemory {
  return {
    id: String(row.id),
    content: row.content,
    summary: row.summary ?? undefined,
    layer: row.layer as RecalledMemory["layer"],
    version: row.version ?? 1,
    accessCount: row.access_count,
    tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [],
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    lastAccessedAt: row.last_accessed_at ?? undefined,
    deprecated: row.deleted === 1,
    deprecationReason: row.deprecation_reason ?? row.delete_reason ?? undefined,
    supersedes: row.supersedes != null ? String(row.supersedes) : undefined,
    validFrom: row.valid_from ?? row.created_at,
  };
}

export class KnowledgineMemoryProvider implements MemoryProvider {
  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly db: Database.Database,
  ) {}

  capabilities(): MemoryProviderCapabilities {
    return {
      versioning: true,
      semanticSearch: false,
      layerPromotion: true,
      temporalQuery: false,
      ttl: false,
      supportedLayers: ["episodic", "semantic", "procedural"],
    };
  }

  async store(request: MemoryStoreRequest): Promise<MemoryStoreResponse> {
    if (!request.content || request.content.trim() === "") {
      throw invalidContent();
    }

    const layer = request.layer ?? DEFAULT_LAYER;
    if (!VALID_LAYERS.includes(layer as CoreMemoryLayer)) {
      throw invalidLayer(layer as string);
    }

    const metadata = request.metadata as Record<string, unknown> | undefined;
    const id = this.memoryManager.store(
      layer as CoreMemoryLayer,
      request.content,
      undefined,
      metadata,
    );

    if (request.tags && request.tags.length > 0) {
      this.db
        .prepare("UPDATE memory_entries SET tags_json = ? WHERE id = ?")
        .run(JSON.stringify(request.tags), id);
    }

    const row = this.db.prepare("SELECT created_at FROM memory_entries WHERE id = ?").get(id) as
      | { created_at: string }
      | undefined;

    return {
      id: String(id),
      layer,
      version: 1,
      createdAt: row?.created_at ?? new Date().toISOString(),
    };
  }

  async recall(request: MemoryRecallRequest): Promise<MemoryRecallResponse> {
    if (request.asOf !== undefined) {
      throw capabilityNotSupported("temporal_query");
    }

    const limit = Math.min(request.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const filter = request.filter;
    const includeVersionHistory = request.includeVersionHistory ?? false;

    const conditions: string[] = ["deleted = 0"];
    const params: unknown[] = [];

    if (!includeVersionHistory) {
      // exclude deprecated (soft-deleted via forget_memory soft) entries are handled via deleted=0
      // version history entries don't apply here since we implement versioning via new rows
    }

    if (filter?.layer) {
      conditions.push("layer = ?");
      params.push(filter.layer);
    }

    if (filter?.createdAfter) {
      conditions.push("created_at >= ?");
      params.push(filter.createdAfter);
    }

    if (filter?.createdBefore) {
      conditions.push("created_at <= ?");
      params.push(filter.createdBefore);
    }

    if (filter?.memoryIds && filter.memoryIds.length > 0) {
      const placeholders = filter.memoryIds.map(() => "?").join(",");
      conditions.push(`id IN (${placeholders})`);
      params.push(...filter.memoryIds.map((id) => Number(id)));
    }

    if (filter?.tags && filter.tags.length > 0) {
      // AND semantics: each tag must be present in tags_json
      for (const tag of filter.tags) {
        conditions.push(`tags_json LIKE ?`);
        params.push(`%${tag}%`);
      }
    }

    const where = conditions.join(" AND ");

    let rows: MemoryEntryRow[];
    if (request.query && request.query.trim() !== "") {
      // FTS search
      const entries = this.memoryManager.search(
        request.query.trim(),
        filter?.layer as CoreMemoryLayer | undefined,
      );
      const searched = entries
        .filter((e) => {
          const id = e.id;
          if (!id) return false;
          const row = this.db
            .prepare(`SELECT * FROM memory_entries WHERE id = ? AND ${where}`)
            .get(id, ...params) as MemoryEntryRow | undefined;
          return !!row;
        })
        .slice(0, limit);

      rows = searched
        .map((e) => {
          if (!e.id) return null;
          return this.db
            .prepare("SELECT * FROM memory_entries WHERE id = ?")
            .get(e.id) as MemoryEntryRow | null;
        })
        .filter((r): r is MemoryEntryRow => r !== null);
    } else {
      // Count for totalCount / hasMore
      const countRow = this.db
        .prepare(`SELECT COUNT(*) as cnt FROM memory_entries WHERE ${where}`)
        .get(...params) as { cnt: number };

      rows = this.db
        .prepare(
          `SELECT * FROM memory_entries WHERE ${where}
           ORDER BY COALESCE(last_accessed_at, created_at) DESC
           LIMIT ?`,
        )
        .all(...params, limit) as MemoryEntryRow[];

      const totalCount = countRow.cnt;
      const memories = rows.map(rowToRecalled);

      // Increment access_count
      if (rows.length > 0) {
        const now = new Date().toISOString();
        const ids = rows.map((r) => r.id);
        const ph = ids.map(() => "?").join(",");
        this.db
          .prepare(
            `UPDATE memory_entries SET access_count = access_count + 1, last_accessed_at = ? WHERE id IN (${ph})`,
          )
          .run(now, ...ids);
      }

      return {
        memories,
        totalCount,
        hasMore: totalCount > limit,
      };
    }

    // query-based path: count separately
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as cnt FROM memory_entries WHERE ${where}`)
      .get(...params) as { cnt: number };

    const memories = rows.map(rowToRecalled);

    if (rows.length > 0) {
      const now = new Date().toISOString();
      const ids = rows.map((r) => r.id);
      const ph = ids.map(() => "?").join(",");
      this.db
        .prepare(
          `UPDATE memory_entries SET access_count = access_count + 1, last_accessed_at = ? WHERE id IN (${ph})`,
        )
        .run(now, ...ids);
    }

    return {
      memories,
      totalCount: countRow.cnt,
      hasMore: countRow.cnt > limit,
    };
  }

  async update(request: MemoryUpdateRequest): Promise<MemoryUpdateResponse> {
    if (request.content !== undefined && request.content.trim() === "") {
      throw invalidContent();
    }
    const numId = Number(request.id);
    const existing = this.db
      .prepare("SELECT * FROM memory_entries WHERE id = ? AND deleted = 0")
      .get(numId) as MemoryEntryRow | undefined;
    if (!existing) throw memoryNotFound(request.id);

    const createVersion = request.createVersion ?? true;
    const now = new Date().toISOString();

    if (!createVersion) {
      // In-place update
      this.memoryManager.update(numId, {
        content: request.content,
        summary: request.summary,
        metadata: request.metadata as Record<string, unknown> | undefined,
      });

      if (request.tags !== undefined) {
        this.db
          .prepare("UPDATE memory_entries SET tags_json = ? WHERE id = ?")
          .run(JSON.stringify(request.tags), numId);
      }

      return {
        id: request.id,
        version: existing.version ?? 1,
        updatedAt: now,
      };
    }

    // Versioned update: atomic deprecate old + create new
    const oldVersion = existing.version ?? 1;
    const transaction = this.db.transaction(() => {
      // Deprecate old entry
      this.db
        .prepare(
          "UPDATE memory_entries SET deleted = 1, deleted_at = ?, delete_reason = ? WHERE id = ?",
        )
        .run(now, "superseded by new version", numId);

      // Build new entry values
      const newContent = request.content ?? existing.content;
      const newSummary = request.summary ?? existing.summary;
      const newMetadata = request.metadata
        ? JSON.stringify({
            ...(existing.metadata_json
              ? (JSON.parse(existing.metadata_json) as Record<string, unknown>)
              : {}),
            ...request.metadata,
          })
        : existing.metadata_json;
      const newTags =
        request.tags !== undefined ? JSON.stringify(request.tags) : existing.tags_json;

      const result = this.db
        .prepare(
          `INSERT INTO memory_entries
            (layer, content, summary, access_count, created_at, metadata_json, tags_json, version, supersedes_memory_id)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        )
        .run(
          existing.layer,
          newContent,
          newSummary,
          now,
          newMetadata,
          newTags,
          oldVersion + 1,
          numId,
        );
      return Number(result.lastInsertRowid);
    });

    const newId = transaction();

    return {
      id: String(newId),
      version: oldVersion + 1,
      previousVersion: oldVersion,
      updatedAt: now,
    };
  }

  async forget(request: MemoryForgetRequest): Promise<MemoryForgetResponse> {
    const numId = Number(request.id);
    const existing = this.db.prepare("SELECT id FROM memory_entries WHERE id = ?").get(numId) as
      | { id: number }
      | undefined;
    if (!existing) throw memoryNotFound(request.id);

    const hard = request.hard ?? false;

    if (hard) {
      this.memoryManager.remove(numId);
    } else {
      const now = new Date().toISOString();
      this.db
        .prepare(
          "UPDATE memory_entries SET deleted = 1, deleted_at = ?, delete_reason = ? WHERE id = ?",
        )
        .run(now, request.reason ?? null, numId);
    }

    return {
      id: request.id,
      forgotten: true,
      method: hard ? "hard" : "soft",
    };
  }
}
