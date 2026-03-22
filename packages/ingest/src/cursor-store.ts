import type Database from "better-sqlite3";
import type { IngestCursorData } from "./types.js";

interface CursorRow {
  plugin_id: string;
  source_path: string;
  checkpoint: string;
  last_ingest_at: string;
}

export class CursorStore {
  constructor(private db: Database.Database) {}

  getCursor(pluginId: string, sourcePath: string): IngestCursorData | undefined {
    const row = this.db
      .prepare<
        [string, string],
        CursorRow
      >("SELECT plugin_id, source_path, checkpoint, last_ingest_at FROM ingest_cursors WHERE plugin_id = ? AND source_path = ?")
      .get(pluginId, sourcePath);

    if (!row) return undefined;

    return {
      pluginId: row.plugin_id,
      sourcePath: row.source_path,
      checkpoint: row.checkpoint,
      lastIngestAt: new Date(row.last_ingest_at),
    };
  }

  saveCursor(cursor: IngestCursorData): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO ingest_cursors (plugin_id, source_path, checkpoint, last_ingest_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        cursor.pluginId,
        cursor.sourcePath,
        cursor.checkpoint,
        cursor.lastIngestAt.toISOString(),
      );
  }

  deleteCursor(pluginId: string, sourcePath: string): boolean {
    const result = this.db
      .prepare("DELETE FROM ingest_cursors WHERE plugin_id = ? AND source_path = ?")
      .run(pluginId, sourcePath);
    return result.changes > 0;
  }

  listCursors(): IngestCursorData[] {
    const rows = this.db
      .prepare<
        [],
        CursorRow
      >("SELECT plugin_id, source_path, checkpoint, last_ingest_at FROM ingest_cursors")
      .all();

    return rows.map((row) => ({
      pluginId: row.plugin_id,
      sourcePath: row.source_path,
      checkpoint: row.checkpoint,
      lastIngestAt: new Date(row.last_ingest_at),
    }));
  }
}
