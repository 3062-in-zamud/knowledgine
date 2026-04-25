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
import { memoryNotFound, invalidContent, invalidLayer } from "@knowledgine/mcp-memory-protocol";
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
  supersedes_memory_id: number | null;
  valid_until: string | null;
  expires_at: string | null;
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
    deprecationReason: row.delete_reason ?? undefined,
    supersedes: row.supersedes_memory_id != null ? String(row.supersedes_memory_id) : undefined,
    validFrom: row.created_at,
  };
}

/** Resolve the chain root for a row by following supersedes_memory_id. */
function chainRootId(rows: MemoryEntryRow[], start: MemoryEntryRow): number {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  let cur = start;
  // Defensive bound — chains can't exceed the candidate-set size.
  for (let i = 0; i <= rows.length; i++) {
    const parentId = cur.supersedes_memory_id;
    if (parentId == null) return cur.id;
    const parent = byId.get(parentId);
    if (!parent) return cur.id;
    cur = parent;
  }
  return cur.id;
}

/**
 * Spec §8.2 step 4: collapse same-chain candidates to the latest version
 * that was valid at `asOf`. The candidates passed in must already satisfy
 * the asOf WHERE clause (created_at <= asOf, etc.); this helper just picks
 * the highest-version row per chain root.
 */
function collapseChainsToLatest(rows: MemoryEntryRow[]): MemoryEntryRow[] {
  if (rows.length <= 1) return rows;
  const groups = new Map<number, MemoryEntryRow>();
  for (const row of rows) {
    const root = chainRootId(rows, row);
    const existing = groups.get(root);
    if (!existing || (row.version ?? 1) > (existing.version ?? 1)) {
      groups.set(root, row);
    }
  }
  return Array.from(groups.values());
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
      temporalQuery: true,
      ttl: true,
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

    const expiresAt = computeExpiresAt(request.ttl);
    if (request.tags || expiresAt !== null) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (request.tags && request.tags.length > 0) {
        sets.push("tags_json = ?");
        params.push(JSON.stringify(request.tags));
      }
      if (expiresAt !== null) {
        sets.push("expires_at = ?");
        params.push(expiresAt);
      }
      if (sets.length > 0) {
        params.push(id);
        this.db.prepare(`UPDATE memory_entries SET ${sets.join(", ")} WHERE id = ?`).run(...params);
      }
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
    const limit = Math.min(request.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const filter = request.filter;
    const includeVersionHistory = request.includeVersionHistory ?? false;
    const now = new Date().toISOString();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (request.asOf !== undefined) {
      // §8.2 Point-in-Time Recall: candidates are rows that existed at the
      // requested asOf, hadn't been superseded yet, and weren't expired then.
      conditions.push("created_at <= ?");
      params.push(request.asOf);
      conditions.push("(deleted = 0 OR deleted_at > ?)");
      params.push(request.asOf);
      conditions.push("(valid_until IS NULL OR valid_until > ?)");
      params.push(request.asOf);
      conditions.push("(expires_at IS NULL OR expires_at > ?)");
      params.push(request.asOf);
    } else {
      // Live recall: filter out expired and (unless asked otherwise) deprecated.
      conditions.push("(expires_at IS NULL OR expires_at > ?)");
      params.push(now);
      if (!includeVersionHistory) {
        conditions.push("deleted = 0");
      }
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
      for (const tag of filter.tags) {
        conditions.push("tags_json LIKE ?");
        params.push(`%${tag}%`);
      }
    }

    const where = conditions.join(" AND ");

    let candidateRows: MemoryEntryRow[];
    if (request.query && request.query.trim() !== "") {
      // FTS path: use MemoryManager.search to seed candidates, then refilter
      // through the full WHERE clause for parity with the non-query path.
      const entries = this.memoryManager.search(
        request.query.trim(),
        filter?.layer as CoreMemoryLayer | undefined,
      );
      const seeded = entries.map((e) => e.id).filter((id): id is number => typeof id === "number");
      if (seeded.length === 0) {
        candidateRows = [];
      } else {
        const placeholders = seeded.map(() => "?").join(",");
        const sql = `SELECT * FROM memory_entries WHERE id IN (${placeholders}) AND ${where}`;
        candidateRows = this.db.prepare(sql).all(...seeded, ...params) as MemoryEntryRow[];
      }
    } else {
      candidateRows = this.db
        .prepare(`SELECT * FROM memory_entries WHERE ${where}`)
        .all(...params) as MemoryEntryRow[];
    }

    // For asOf queries, collapse same-chain rows to the latest version that
    // was valid at asOf (§8.2 step 4). Live recall does not collapse — chain
    // members are filtered by `deleted = 0` already.
    let resultRows: MemoryEntryRow[];
    if (request.asOf !== undefined) {
      resultRows = collapseChainsToLatest(candidateRows);
    } else {
      resultRows = candidateRows;
    }

    // Sort newest-first by last access then creation, then page.
    resultRows.sort((a, b) => {
      const ka = a.last_accessed_at ?? a.created_at;
      const kb = b.last_accessed_at ?? b.created_at;
      if (ka === kb) return 0;
      return ka < kb ? 1 : -1;
    });

    const totalCount = resultRows.length;
    const sliced = resultRows.slice(0, limit);

    // Increment access_count for live recalls only — asOf is read-only.
    if (request.asOf === undefined && sliced.length > 0) {
      const ids = sliced.map((r) => r.id);
      const ph = ids.map(() => "?").join(",");
      this.db.transaction(() => {
        this.db
          .prepare(
            `UPDATE memory_entries SET access_count = access_count + 1, last_accessed_at = ? WHERE id IN (${ph})`,
          )
          .run(now, ...ids);
      })();
    }

    return {
      memories: sliced.map(rowToRecalled),
      totalCount,
      hasMore: totalCount > sliced.length,
    };
  }

  async update(request: MemoryUpdateRequest): Promise<MemoryUpdateResponse> {
    if (request.content !== undefined && request.content.trim() === "") {
      throw invalidContent();
    }
    const numId = Number(request.id);
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        `SELECT * FROM memory_entries
         WHERE id = ? AND deleted = 0
           AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(numId, now) as MemoryEntryRow | undefined;
    if (!existing) throw memoryNotFound(request.id);

    const createVersion = request.createVersion ?? true;
    // TTL handling. Inheritance rules (design.md §Decision 5):
    //   - omitted ttl  → keep existing expires_at
    //   - explicit ttl → overwrite with `now + ttl*1000`
    const ttlExplicit = "ttl" in request && (request as { ttl?: number }).ttl !== undefined;
    const newExpiresAt = ttlExplicit
      ? computeExpiresAt((request as { ttl?: number }).ttl)
      : existing.expires_at;

    if (!createVersion) {
      this.memoryManager.update(numId, {
        content: request.content,
        summary: request.summary,
        metadata: request.metadata as Record<string, unknown> | undefined,
      });
      const sets: string[] = [];
      const params: unknown[] = [];
      if (request.tags !== undefined) {
        sets.push("tags_json = ?");
        params.push(JSON.stringify(request.tags));
      }
      if (ttlExplicit) {
        sets.push("expires_at = ?");
        params.push(newExpiresAt);
      }
      if (sets.length > 0) {
        params.push(numId);
        this.db.prepare(`UPDATE memory_entries SET ${sets.join(", ")} WHERE id = ?`).run(...params);
      }
      return {
        id: request.id,
        version: existing.version ?? 1,
        updatedAt: now,
      };
    }

    // Versioned update: deprecate old, insert new, set valid_until on old =
    // new.created_at to support §8.2 chain reconstruction.
    const oldVersion = existing.version ?? 1;
    const newId = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE memory_entries
              SET deleted = 1,
                  deleted_at = ?,
                  delete_reason = ?,
                  valid_until = ?
            WHERE id = ?`,
        )
        .run(now, "superseded by new version", now, numId);

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
            (layer, content, summary, access_count, created_at,
             metadata_json, tags_json, version, supersedes_memory_id, expires_at)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
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
          newExpiresAt,
        );
      return Number(result.lastInsertRowid);
    })();

    return {
      id: String(newId),
      version: oldVersion + 1,
      previousVersion: oldVersion,
      updatedAt: now,
    };
  }

  async forget(request: MemoryForgetRequest): Promise<MemoryForgetResponse> {
    const numId = Number(request.id);
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        `SELECT id, deleted FROM memory_entries
         WHERE id = ?
           AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(numId, now) as { id: number; deleted: number } | undefined;
    if (!existing) throw memoryNotFound(request.id);

    const hard = request.hard ?? false;
    if (hard) {
      this.memoryManager.remove(numId);
    } else {
      this.db
        .prepare(
          `UPDATE memory_entries
              SET deleted = 1,
                  deleted_at = ?,
                  delete_reason = ?
            WHERE id = ?`,
        )
        .run(now, request.reason ?? "forgotten", numId);
    }

    return {
      id: request.id,
      forgotten: true,
      method: hard ? "hard" : "soft",
    };
  }
}

function computeExpiresAt(ttlSeconds: number | undefined): string | null {
  if (ttlSeconds === undefined || ttlSeconds === null) return null;
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return null;
  return new Date(Date.now() + Math.floor(ttlSeconds * 1000)).toISOString();
}
