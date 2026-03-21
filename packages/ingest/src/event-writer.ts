import type Database from "better-sqlite3";
import type { KnowledgeRepository } from "@knowledgine/core";
import type { NormalizedEvent } from "./types.js";
import { normalizeToKnowledgeData, normalizeToKnowledgeEvent } from "./normalizer.js";

export class EventWriter {
  constructor(
    private db: Database.Database,
    private repository: KnowledgeRepository,
  ) {}

  /** 単一イベント書き込み（capture用） */
  writeEvent(event: NormalizedEvent): { id: number } {
    let lastId = 0;
    const insertEvent = this.db.prepare(`
      INSERT INTO events (event_type, source_type, source_id, source_uri, actor, content, content_hash, occurred_at, metadata_json, project_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      const knowledgeEvent = normalizeToKnowledgeEvent(event);
      const result = insertEvent.run(
        knowledgeEvent.eventType,
        knowledgeEvent.sourceType,
        knowledgeEvent.sourceId ?? null,
        knowledgeEvent.sourceUri ?? null,
        knowledgeEvent.actor ?? null,
        knowledgeEvent.content,
        knowledgeEvent.contentHash,
        knowledgeEvent.occurredAt,
        knowledgeEvent.metadataJson ? JSON.stringify(knowledgeEvent.metadataJson) : null,
        knowledgeEvent.projectId ?? null,
        knowledgeEvent.sessionId ?? null,
      );
      lastId = Number(result.lastInsertRowid);
      const knowledgeData = normalizeToKnowledgeData(event);
      this.repository.saveNote(knowledgeData);
    })();

    return { id: lastId };
  }

  /** バッチ書き込み（IngestEngine用） */
  writeBatch(events: NormalizedEvent[]): { processed: number; errors: number } {
    let processed = 0;
    let errors = 0;

    const insertEvent = this.db.prepare(`
      INSERT INTO events (event_type, source_type, source_id, source_uri, actor, content, content_hash, occurred_at, metadata_json, project_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      for (const event of events) {
        try {
          const knowledgeEvent = normalizeToKnowledgeEvent(event);
          insertEvent.run(
            knowledgeEvent.eventType,
            knowledgeEvent.sourceType,
            knowledgeEvent.sourceId ?? null,
            knowledgeEvent.sourceUri ?? null,
            knowledgeEvent.actor ?? null,
            knowledgeEvent.content,
            knowledgeEvent.contentHash,
            knowledgeEvent.occurredAt,
            knowledgeEvent.metadataJson ? JSON.stringify(knowledgeEvent.metadataJson) : null,
            knowledgeEvent.projectId ?? null,
            knowledgeEvent.sessionId ?? null,
          );
          const knowledgeData = normalizeToKnowledgeData(event);
          this.repository.saveNote(knowledgeData);
          processed++;
        } catch {
          errors++;
        }
      }
    })();

    return { processed, errors };
  }
}
