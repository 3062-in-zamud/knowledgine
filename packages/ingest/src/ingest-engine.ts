import type Database from "better-sqlite3";
import type { KnowledgeRepository } from "@knowledgine/core";
import type { IngestSummary, NormalizedEvent } from "./types.js";
import type { PluginRegistry } from "./plugin-registry.js";
import { CursorStore } from "./cursor-store.js";
import { normalizeToKnowledgeData, normalizeToKnowledgeEvent } from "./normalizer.js";

const BATCH_SIZE = 100;

export class IngestEngine {
  private cursorStore: CursorStore;

  constructor(
    private registry: PluginRegistry,
    private db: Database.Database,
    private repository: KnowledgeRepository,
  ) {
    this.cursorStore = new CursorStore(db);
  }

  async ingest(
    pluginId: string,
    sourcePath: string,
    options?: { full?: boolean },
  ): Promise<IngestSummary> {
    const start = Date.now();
    const plugin = this.registry.getOrThrow(pluginId);
    let processed = 0;
    let errors = 0;

    const cursor = options?.full ? undefined : this.cursorStore.getCursor(pluginId, sourcePath);
    const generator = cursor
      ? plugin.ingestIncremental(sourcePath, cursor.checkpoint)
      : plugin.ingestAll(sourcePath);

    let batch: NormalizedEvent[] = [];
    for await (const event of generator) {
      batch.push(event);
      if (batch.length >= BATCH_SIZE) {
        const result = this.processBatch(batch);
        processed += result.processed;
        errors += result.errors;
        batch = [];
      }
    }

    if (batch.length > 0) {
      const result = this.processBatch(batch);
      processed += result.processed;
      errors += result.errors;
    }

    const checkpoint = await plugin.getCurrentCheckpoint(sourcePath);
    this.cursorStore.saveCursor({
      pluginId,
      sourcePath,
      checkpoint,
      lastIngestAt: new Date(),
    });

    return { pluginId, processed, errors, elapsedMs: Date.now() - start };
  }

  async ingestAll(sourcePath: string, options?: { full?: boolean }): Promise<IngestSummary[]> {
    const plugins = this.registry.list();
    const results: IngestSummary[] = [];
    for (const plugin of plugins) {
      const summary = await this.ingest(plugin.manifest.id, sourcePath, options);
      results.push(summary);
    }
    return results;
  }

  private processBatch(batch: NormalizedEvent[]): { processed: number; errors: number } {
    let processed = 0;
    let errors = 0;

    const insertEvent = this.db.prepare(`
      INSERT INTO events (event_type, source_type, source_id, source_uri, actor, content, content_hash, occurred_at, metadata_json, project_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const runBatch = this.db.transaction(() => {
      for (const event of batch) {
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
    });

    runBatch();
    return { processed, errors };
  }
}
