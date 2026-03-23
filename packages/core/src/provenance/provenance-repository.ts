import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { DatabaseError } from "../errors.js";

export interface ProvenanceRecord {
  id: string;
  entityUri: string;
  activityType: "ingest" | "extract" | "link" | "embed";
  agent?: string;
  sourceUri?: string;
  generatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ProvenanceLink {
  id: string;
  fromEntityUri: string;
  toEntityUri: string;
  relation: string;
  createdAt: string;
}

export interface FileTimelineEntry {
  filePath: string;
  eventId: string;
  changedAt: string;
  changeType: "created" | "modified" | "deleted" | "renamed";
}

export interface Snapshot {
  id: string;
  snapshotAt: string;
  entityCount?: number;
  eventCount?: number;
  metadata?: Record<string, unknown>;
}

interface ProvenanceRow {
  id: string;
  entity_uri: string;
  activity_type: string;
  agent: string | null;
  source_uri: string | null;
  generated_at: string;
  metadata: string | null;
}

interface ProvenanceLinkRow {
  id: string;
  from_entity_uri: string;
  to_entity_uri: string;
  relation: string;
  created_at: string;
}

interface FileTimelineRow {
  file_path: string;
  event_id: string;
  changed_at: string;
  change_type: string;
}

interface SnapshotRow {
  id: string;
  snapshot_at: string;
  entity_count: number | null;
  event_count: number | null;
  metadata: string | null;
}

function rowToProvenance(row: ProvenanceRow): ProvenanceRecord {
  return {
    id: row.id,
    entityUri: row.entity_uri,
    activityType: row.activity_type as ProvenanceRecord["activityType"],
    agent: row.agent ?? undefined,
    sourceUri: row.source_uri ?? undefined,
    generatedAt: row.generated_at,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  };
}

function rowToProvenanceLink(row: ProvenanceLinkRow): ProvenanceLink {
  return {
    id: row.id,
    fromEntityUri: row.from_entity_uri,
    toEntityUri: row.to_entity_uri,
    relation: row.relation,
    createdAt: row.created_at,
  };
}

function rowToFileTimeline(row: FileTimelineRow): FileTimelineEntry {
  return {
    filePath: row.file_path,
    eventId: row.event_id,
    changedAt: row.changed_at,
    changeType: row.change_type as FileTimelineEntry["changeType"],
  };
}

function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    snapshotAt: row.snapshot_at,
    entityCount: row.entity_count ?? undefined,
    eventCount: row.event_count ?? undefined,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  };
}

export class ProvenanceRepository {
  constructor(private db: Database.Database) {}

  // ── 来歴記録 ────────────────────────────────────────────────────

  record(entry: Omit<ProvenanceRecord, "id">): string {
    try {
      const id = randomUUID();
      const stmt = this.db.prepare(`
        INSERT INTO provenance (id, entity_uri, activity_type, agent, source_uri, generated_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        entry.entityUri,
        entry.activityType,
        entry.agent ?? null,
        entry.sourceUri ?? null,
        entry.generatedAt,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      );
      return id;
    } catch (error) {
      throw new DatabaseError("provenance.record", error, { entityUri: entry.entityUri });
    }
  }

  getByEntityUri(uri: string): ProvenanceRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM provenance WHERE entity_uri = ? ORDER BY generated_at DESC")
      .all(uri) as ProvenanceRow[];
    return rows.map(rowToProvenance);
  }

  getByAgent(agent: string, limit = 100): ProvenanceRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM provenance WHERE agent = ? ORDER BY generated_at DESC LIMIT ?")
      .all(agent, limit) as ProvenanceRow[];
    return rows.map(rowToProvenance);
  }

  getByActivity(type: ProvenanceRecord["activityType"], limit = 100): ProvenanceRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM provenance WHERE activity_type = ? ORDER BY generated_at DESC LIMIT ?",
      )
      .all(type, limit) as ProvenanceRow[];
    return rows.map(rowToProvenance);
  }

  // ── プロベナンスリンク ─────────────────────────────────────────

  createLink(
    fromEntityUri: string,
    toEntityUri: string,
    relation: string,
    createdAt?: string,
  ): string {
    try {
      const id = randomUUID();
      const now = createdAt ?? new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO provenance_links (id, from_entity_uri, to_entity_uri, relation, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, fromEntityUri, toEntityUri, relation, now);
      return id;
    } catch (error) {
      throw new DatabaseError("provenance.createLink", error, { fromEntityUri, toEntityUri });
    }
  }

  findLinks(fromEntityUri?: string, toEntityUri?: string): ProvenanceLink[] {
    if (fromEntityUri && toEntityUri) {
      const rows = this.db
        .prepare(
          "SELECT * FROM provenance_links WHERE from_entity_uri = ? AND to_entity_uri = ? ORDER BY created_at DESC",
        )
        .all(fromEntityUri, toEntityUri) as ProvenanceLinkRow[];
      return rows.map(rowToProvenanceLink);
    } else if (fromEntityUri) {
      const rows = this.db
        .prepare(
          "SELECT * FROM provenance_links WHERE from_entity_uri = ? ORDER BY created_at DESC",
        )
        .all(fromEntityUri) as ProvenanceLinkRow[];
      return rows.map(rowToProvenanceLink);
    } else if (toEntityUri) {
      const rows = this.db
        .prepare("SELECT * FROM provenance_links WHERE to_entity_uri = ? ORDER BY created_at DESC")
        .all(toEntityUri) as ProvenanceLinkRow[];
      return rows.map(rowToProvenanceLink);
    } else {
      const rows = this.db
        .prepare("SELECT * FROM provenance_links ORDER BY created_at DESC")
        .all() as ProvenanceLinkRow[];
      return rows.map(rowToProvenanceLink);
    }
  }

  // ── ファイルタイムライン ──────────────────────────────────────────

  recordFileEvent(
    filePath: string,
    changeType: FileTimelineEntry["changeType"],
    eventId?: string,
    changedAt?: string,
  ): void {
    try {
      const now = changedAt ?? new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO file_timeline (file_path, event_id, changed_at, change_type)
           VALUES (?, ?, ?, ?)`,
        )
        .run(filePath, eventId ?? "", now, changeType);
    } catch (error) {
      throw new DatabaseError("provenance.recordFileEvent", error, { filePath });
    }
  }

  getFileTimeline(filePath: string): FileTimelineEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM file_timeline WHERE file_path = ? ORDER BY changed_at ASC")
      .all(filePath) as FileTimelineRow[];
    return rows.map(rowToFileTimeline);
  }

  // ── スナップショット ─────────────────────────────────────────────

  createSnapshot(
    snapshotAt: string,
    stats: { entityCount?: number; eventCount?: number },
    metadata?: Record<string, unknown>,
  ): string {
    try {
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO snapshots (id, snapshot_at, entity_count, event_count, metadata)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          snapshotAt,
          stats.entityCount ?? null,
          stats.eventCount ?? null,
          metadata ? JSON.stringify(metadata) : null,
        );
      return id;
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
