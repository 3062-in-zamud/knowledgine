import type Database from "better-sqlite3";
import { DatabaseError } from "../errors.js";

export interface ProvenanceRecord {
  id: number;
  entityUri: string;
  activityType: "ingest" | "extract" | "link" | "embed";
  agent: string;
  inputUris: string[];
  outputUris: string[];
  startedAt: string;
  endedAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface FileTimelineEntry {
  id: number;
  filePath: string;
  eventType: "created" | "modified" | "deleted" | "renamed";
  eventId?: number;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface Snapshot {
  id: number;
  snapshotAt: string;
  noteCount: number;
  eventCount: number;
  entityCount: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface ProvenanceRow {
  id: number;
  entity_uri: string;
  activity_type: string;
  agent: string;
  input_uris: string;
  output_uris: string;
  started_at: string;
  ended_at: string | null;
  metadata_json: string | null;
  created_at: string;
}

interface FileTimelineRow {
  id: number;
  file_path: string;
  event_type: string;
  event_id: number | null;
  occurred_at: string;
  metadata_json: string | null;
}

interface SnapshotRow {
  id: number;
  snapshot_at: string;
  note_count: number;
  event_count: number;
  entity_count: number;
  metadata_json: string | null;
  created_at: string;
}

function rowToProvenance(row: ProvenanceRow): ProvenanceRecord {
  return {
    id: row.id,
    entityUri: row.entity_uri,
    activityType: row.activity_type as ProvenanceRecord["activityType"],
    agent: row.agent,
    inputUris: JSON.parse(row.input_uris) as string[],
    outputUris: JSON.parse(row.output_uris) as string[],
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : undefined,
    createdAt: row.created_at,
  };
}

function rowToFileTimeline(row: FileTimelineRow): FileTimelineEntry {
  return {
    id: row.id,
    filePath: row.file_path,
    eventType: row.event_type as FileTimelineEntry["eventType"],
    eventId: row.event_id ?? undefined,
    occurredAt: row.occurred_at,
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : undefined,
  };
}

function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    snapshotAt: row.snapshot_at,
    noteCount: row.note_count,
    eventCount: row.event_count,
    entityCount: row.entity_count,
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : undefined,
    createdAt: row.created_at,
  };
}

export class ProvenanceRepository {
  constructor(private db: Database.Database) {}

  // ── 来歴記録 ────────────────────────────────────────────────────

  record(entry: Omit<ProvenanceRecord, "id" | "createdAt">): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO provenance (entity_uri, activity_type, agent, input_uris, output_uris, started_at, ended_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        entry.entityUri,
        entry.activityType,
        entry.agent,
        JSON.stringify(entry.inputUris ?? []),
        JSON.stringify(entry.outputUris ?? []),
        entry.startedAt,
        entry.endedAt ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      );
      return Number(info.lastInsertRowid);
    } catch (error) {
      throw new DatabaseError("provenance.record", error, { entityUri: entry.entityUri });
    }
  }

  getByEntityUri(uri: string): ProvenanceRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM provenance WHERE entity_uri = ? ORDER BY started_at DESC")
      .all(uri) as ProvenanceRow[];
    return rows.map(rowToProvenance);
  }

  getByAgent(agent: string, limit = 100): ProvenanceRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM provenance WHERE agent = ? ORDER BY started_at DESC LIMIT ?")
      .all(agent, limit) as ProvenanceRow[];
    return rows.map(rowToProvenance);
  }

  getByActivity(type: ProvenanceRecord["activityType"], limit = 100): ProvenanceRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM provenance WHERE activity_type = ? ORDER BY started_at DESC LIMIT ?")
      .all(type, limit) as ProvenanceRow[];
    return rows.map(rowToProvenance);
  }

  // ── ファイルタイムライン ──────────────────────────────────────────

  recordFileEvent(
    filePath: string,
    eventType: FileTimelineEntry["eventType"],
    eventId?: number,
    occurredAt?: string,
  ): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO file_timeline (file_path, event_type, event_id, occurred_at)
        VALUES (?, ?, ?, COALESCE(?, datetime('now')))
      `);
      const info = stmt.run(filePath, eventType, eventId ?? null, occurredAt ?? null);
      return Number(info.lastInsertRowid);
    } catch (error) {
      throw new DatabaseError("provenance.recordFileEvent", error, { filePath });
    }
  }

  getFileTimeline(filePath: string): FileTimelineEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM file_timeline WHERE file_path = ? ORDER BY occurred_at ASC")
      .all(filePath) as FileTimelineRow[];
    return rows.map(rowToFileTimeline);
  }

  // ── スナップショット ─────────────────────────────────────────────

  createSnapshot(
    snapshotAt: string,
    stats: { noteCount: number; eventCount: number; entityCount: number },
  ): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO snapshots (snapshot_at, note_count, event_count, entity_count)
        VALUES (?, ?, ?, ?)
      `);
      const info = stmt.run(snapshotAt, stats.noteCount, stats.eventCount, stats.entityCount);
      return Number(info.lastInsertRowid);
    } catch (error) {
      throw new DatabaseError("provenance.createSnapshot", error, { snapshotAt });
    }
  }

  getSnapshots(limit = 100): Snapshot[] {
    const rows = this.db
      .prepare("SELECT * FROM snapshots ORDER BY snapshot_at DESC LIMIT ?")
      .all(limit) as SnapshotRow[];
    return rows.map(rowToSnapshot);
  }
}
