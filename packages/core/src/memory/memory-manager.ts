import type Database from "better-sqlite3";
import type { MemoryLayer, MemoryEntry, MemoryContext } from "../types.js";
import { ValidationError } from "../errors.js";
import { MemoryNotFoundError, MemoryPromotionError, MemoryDemotionError } from "../errors.js";

const VALID_LAYERS: MemoryLayer[] = ["episodic", "semantic", "procedural"];

const PROMOTION_THRESHOLDS: Record<string, number> = {
  episodic: 3,
  semantic: 10,
};

const NEXT_LAYER: Record<string, MemoryLayer> = {
  episodic: "semantic",
  semantic: "procedural",
};

const PREV_LAYER: Record<string, MemoryLayer> = {
  procedural: "semantic",
  semantic: "episodic",
};

interface MemoryEntryRow {
  id: number;
  note_id: number | null;
  layer: string;
  content: string;
  summary: string | null;
  access_count: number;
  last_accessed_at: string | null;
  promoted_from: number | null;
  created_at: string;
  updated_at: string | null;
  metadata_json: string | null;
}

export class MemoryManager {
  constructor(private db: Database.Database) {}

  private toMemoryEntry(row: MemoryEntryRow): MemoryEntry {
    return {
      id: row.id,
      noteId: row.note_id ?? undefined,
      layer: row.layer as MemoryLayer,
      content: row.content,
      summary: row.summary ?? undefined,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at ?? undefined,
      promotedFrom: row.promoted_from ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      metadata: row.metadata_json
        ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
        : undefined,
    };
  }

  private getByIdOrThrow(id: number): MemoryEntryRow {
    const row = this.db.prepare("SELECT * FROM memory_entries WHERE id = ?").get(id) as
      | MemoryEntryRow
      | undefined;
    if (!row) throw new MemoryNotFoundError(id);
    return row;
  }

  store(
    layer: MemoryLayer,
    content: string,
    noteId?: number,
    metadata?: Record<string, unknown>,
  ): number {
    if (!VALID_LAYERS.includes(layer)) {
      throw new ValidationError("layer", layer, `Layer must be one of: ${VALID_LAYERS.join(", ")}`);
    }
    if (!content || typeof content !== "string" || content.trim() === "") {
      throw new ValidationError(
        "content",
        content,
        "Content is required and must be a non-empty string",
      );
    }

    const now = new Date().toISOString();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO memory_entries (note_id, layer, content, access_count, created_at, metadata_json)
      VALUES (?, ?, ?, 0, ?, ?)
    `);
    const info = stmt.run(noteId ?? null, layer, content, now, metadataJson);
    return Number(info.lastInsertRowid);
  }

  retrieve(layer: MemoryLayer, limit = 10): MemoryEntry[] {
    const run = this.db.transaction(() => {
      const rows = this.db
        .prepare(
          `
        SELECT * FROM memory_entries WHERE layer = ?
        ORDER BY COALESCE(last_accessed_at, created_at) DESC
        LIMIT ?
      `,
        )
        .all(layer, limit) as MemoryEntryRow[];

      if (rows.length > 0) {
        const now = new Date().toISOString();
        const ids = rows.map((r) => r.id);
        const placeholders = ids.map(() => "?").join(",");
        this.db
          .prepare(
            `
          UPDATE memory_entries SET access_count = access_count + 1, last_accessed_at = ?
          WHERE id IN (${placeholders})
        `,
          )
          .run(now, ...ids);

        // Return rows with updated values
        for (const row of rows) {
          row.access_count += 1;
          row.last_accessed_at = now;
        }
      }

      return rows.map((r) => this.toMemoryEntry(r));
    });

    return run();
  }

  search(query: string, layer?: MemoryLayer): MemoryEntry[] {
    if (!query || typeof query !== "string" || query.trim() === "") {
      throw new ValidationError("query", query, "Query is required and must be a non-empty string");
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length >= 3) {
      // FTS5 search with quoted query to disable special syntax
      const ftsQuery = `"${trimmedQuery}"`;
      let sql = `
        SELECT me.* FROM memory_entries me
        JOIN memory_entries_fts fts ON me.id = fts.rowid
        WHERE memory_entries_fts MATCH ?
      `;
      const params: unknown[] = [ftsQuery];

      if (layer) {
        sql += " AND me.layer = ?";
        params.push(layer);
      }

      sql += " ORDER BY rank";
      return (this.db.prepare(sql).all(...params) as MemoryEntryRow[]).map((r) =>
        this.toMemoryEntry(r),
      );
    } else {
      // LIKE fallback for 1-2 character queries
      let sql = `
        SELECT * FROM memory_entries
        WHERE (content LIKE ? OR summary LIKE ?)
      `;
      const likePattern = `%${trimmedQuery}%`;
      const params: unknown[] = [likePattern, likePattern];

      if (layer) {
        sql += " AND layer = ?";
        params.push(layer);
      }

      sql += " ORDER BY COALESCE(last_accessed_at, created_at) DESC";
      return (this.db.prepare(sql).all(...params) as MemoryEntryRow[]).map((r) =>
        this.toMemoryEntry(r),
      );
    }
  }

  update(
    id: number,
    updates: { content?: string; summary?: string; metadata?: Record<string, unknown> },
  ): void {
    this.getByIdOrThrow(id);

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.content !== undefined) {
      setClauses.push("content = ?");
      params.push(updates.content);
    }
    if (updates.summary !== undefined) {
      setClauses.push("summary = ?");
      params.push(updates.summary);
    }
    if (updates.metadata !== undefined) {
      setClauses.push("metadata_json = ?");
      params.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) return;

    const now = new Date().toISOString();
    setClauses.push("updated_at = ?");
    params.push(now);
    params.push(id);

    this.db
      .prepare(`UPDATE memory_entries SET ${setClauses.join(", ")} WHERE id = ?`)
      .run(...params);
  }

  remove(id: number): boolean {
    const info = this.db.prepare("DELETE FROM memory_entries WHERE id = ?").run(id);
    return info.changes > 0;
  }

  promote(id: number): MemoryEntry {
    const row = this.getByIdOrThrow(id);

    if (row.layer === "procedural") {
      throw new MemoryPromotionError(id, row.layer);
    }

    const threshold = PROMOTION_THRESHOLDS[row.layer];
    if (row.access_count < threshold) {
      throw new MemoryPromotionError(id, row.layer, row.access_count, threshold);
    }

    const nextLayer = NEXT_LAYER[row.layer];
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE memory_entries SET layer = ?, updated_at = ? WHERE id = ?")
      .run(nextLayer, now, id);

    return this.toMemoryEntry({ ...row, layer: nextLayer, updated_at: now });
  }

  demote(id: number): MemoryEntry {
    const row = this.getByIdOrThrow(id);

    if (row.layer === "episodic") {
      throw new MemoryDemotionError(id, row.layer);
    }

    const prevLayer = PREV_LAYER[row.layer];
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE memory_entries SET layer = ?, updated_at = ? WHERE id = ?")
      .run(prevLayer, now, id);

    return this.toMemoryEntry({ ...row, layer: prevLayer, updated_at: now });
  }

  getContext(noteId?: number): MemoryContext {
    const buildQuery = (layer: MemoryLayer, limit?: number) => {
      let sql = `SELECT * FROM memory_entries WHERE layer = ?`;
      const params: unknown[] = [layer];

      if (noteId !== undefined) {
        sql += " AND note_id = ?";
        params.push(noteId);
      }

      sql += " ORDER BY COALESCE(last_accessed_at, created_at) DESC";

      if (limit !== undefined) {
        sql += " LIMIT ?";
        params.push(limit);
      }

      return this.db.prepare(sql).all(...params) as MemoryEntryRow[];
    };

    return {
      episodic: buildQuery("episodic", 5).map((r) => this.toMemoryEntry(r)),
      semantic: buildQuery("semantic", 10).map((r) => this.toMemoryEntry(r)),
      procedural: buildQuery("procedural").map((r) => this.toMemoryEntry(r)),
    };
  }
}
