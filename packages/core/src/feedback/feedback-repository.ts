import type Database from "better-sqlite3";
import type { FeedbackErrorType, FeedbackStatus } from "../types.js";

const VALID_ERROR_TYPES: FeedbackErrorType[] = ["false_positive", "wrong_type", "missed_entity"];
const VALID_STATUSES: FeedbackStatus[] = ["pending", "applied", "dismissed"];

export interface CreateFeedbackInput {
  entityName: string;
  errorType: FeedbackErrorType;
  entityType?: string;
  correctType?: string;
  noteId?: number;
  details?: string;
}

export interface FeedbackRecord {
  id: number;
  entityName: string;
  entityType: string | null;
  errorType: FeedbackErrorType;
  correctType: string | null;
  noteId: number | null;
  details: string | null;
  status: FeedbackStatus;
  createdAt: string;
  appliedAt: string | null;
}

interface FeedbackRow {
  id: number;
  entity_name: string;
  entity_type: string | null;
  error_type: string;
  correct_type: string | null;
  note_id: number | null;
  details: string | null;
  status: string;
  created_at: string;
  applied_at: string | null;
}

function rowToRecord(row: FeedbackRow): FeedbackRecord {
  return {
    id: row.id,
    entityName: row.entity_name,
    entityType: row.entity_type,
    errorType: row.error_type as FeedbackErrorType,
    correctType: row.correct_type,
    noteId: row.note_id,
    details: row.details,
    status: row.status as FeedbackStatus,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}

export class FeedbackRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateFeedbackInput): FeedbackRecord {
    if (!VALID_ERROR_TYPES.includes(input.errorType)) {
      throw new Error(
        `Invalid error_type: "${input.errorType}". Must be one of: ${VALID_ERROR_TYPES.join(", ")}`,
      );
    }

    const stmt = this.db.prepare(`
      INSERT INTO extraction_feedback (entity_name, entity_type, error_type, correct_type, note_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      input.entityName,
      input.entityType ?? null,
      input.errorType,
      input.correctType ?? null,
      input.noteId ?? null,
      input.details ?? null,
    );
    return this.getById(Number(info.lastInsertRowid))!;
  }

  getById(id: number): FeedbackRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM extraction_feedback WHERE id = ?")
      .get(id) as FeedbackRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  list(options?: { status?: string; limit?: number }): FeedbackRecord[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.status) {
      if (!VALID_STATUSES.includes(options.status as FeedbackStatus)) {
        throw new Error(
          `Invalid status: "${options.status}". Must be one of: ${VALID_STATUSES.join(", ")}`,
        );
      }
      conditions.push("status = ?");
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = options?.limit ?? 100;
    params.push(limit);

    const rows = this.db
      .prepare(`SELECT * FROM extraction_feedback ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params) as FeedbackRow[];

    return rows.map(rowToRecord);
  }

  updateStatus(id: number, status: string): void {
    if (!VALID_STATUSES.includes(status as FeedbackStatus)) {
      throw new Error(
        `Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`,
      );
    }

    const appliedAt = status === "applied" ? new Date().toISOString() : null;
    const info = this.db
      .prepare("UPDATE extraction_feedback SET status = ?, applied_at = ? WHERE id = ?")
      .run(status, appliedAt, id);

    if (info.changes === 0) {
      throw new Error(`Feedback record not found: id=${id}`);
    }
  }

  delete(id: number): void {
    const info = this.db
      .prepare("DELETE FROM extraction_feedback WHERE id = ?")
      .run(id);

    if (info.changes === 0) {
      throw new Error(`Feedback record not found: id=${id}`);
    }
  }

  getStats(): { total: number; pending: number; applied: number; dismissed: number } {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) as count FROM extraction_feedback GROUP BY status`,
      )
      .all() as Array<{ status: string; count: number }>;

    const stats = { total: 0, pending: 0, applied: 0, dismissed: 0 };
    for (const row of rows) {
      stats.total += row.count;
      if (row.status === "pending") stats.pending = row.count;
      else if (row.status === "applied") stats.applied = row.count;
      else if (row.status === "dismissed") stats.dismissed = row.count;
    }
    return stats;
  }
}
