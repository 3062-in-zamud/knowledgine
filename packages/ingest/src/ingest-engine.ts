import type Database from "better-sqlite3";
import type { KnowledgeRepository } from "@knowledgine/core";
import type { IngestSummary, NormalizedEvent } from "./types.js";
import type { PluginRegistry } from "./plugin-registry.js";
import { CursorStore } from "./cursor-store.js";
import { EventWriter } from "./event-writer.js";

const BATCH_SIZE = 100;

/** Plugin IDs that represent file-based sources (eligible for stale cleanup) */
const FILE_BASED_PLUGINS = new Set(["markdown", "obsidian"]);

export class IngestEngine {
  private cursorStore: CursorStore;
  private eventWriter: EventWriter;

  constructor(
    private registry: PluginRegistry,
    private db: Database.Database,
    private repository: KnowledgeRepository,
  ) {
    this.cursorStore = new CursorStore(db);
    this.eventWriter = new EventWriter(db, repository);
  }

  async ingest(
    pluginId: string,
    sourcePath: string,
    options?: { full?: boolean; pluginConfig?: Record<string, unknown> },
  ): Promise<IngestSummary> {
    const start = Date.now();
    const plugin = this.registry.getOrThrow(pluginId);
    let processed = 0;
    let errors = 0;
    let deleted = 0;
    let skipped = 0;
    let skippedLargeDiff = 0;
    const allNoteIds: number[] = [];

    if (options?.pluginConfig) {
      await plugin.initialize(options.pluginConfig);
    }

    const cursor = options?.full ? undefined : this.cursorStore.getCursor(pluginId, sourcePath);
    const generator = cursor
      ? plugin.ingestIncremental(sourcePath, cursor.checkpoint)
      : plugin.ingestAll(sourcePath);

    const processedPaths = new Set<string>();
    let batch: NormalizedEvent[] = [];
    for await (const event of generator) {
      if (!event.content || event.content.trim() === "") {
        skipped++;
        continue;
      }
      if (event.metadata.skippedReason === "large_diff") {
        skippedLargeDiff++;
      }
      batch.push(event);
      processedPaths.add(event.sourceUri);
      if (batch.length >= BATCH_SIZE) {
        const result = this.processBatch(batch);
        processed += result.processed;
        errors += result.errors;
        allNoteIds.push(...result.noteIds);
        batch = [];
      }
    }

    if (batch.length > 0) {
      const result = this.processBatch(batch);
      processed += result.processed;
      errors += result.errors;
      allNoteIds.push(...result.noteIds);
    }

    // Cleanup stale notes for file-based plugins on --full ingest
    if (options?.full && FILE_BASED_PLUGINS.has(pluginId)) {
      deleted = this.cleanupStaleNotes(pluginId, processedPaths);
    }

    const checkpoint = await plugin.getCurrentCheckpoint(sourcePath);
    this.cursorStore.saveCursor({
      pluginId,
      sourcePath,
      checkpoint,
      lastIngestAt: new Date(),
    });

    return {
      pluginId,
      processed,
      errors,
      deleted,
      skipped,
      ...(skippedLargeDiff > 0 ? { skippedLargeDiff } : {}),
      elapsedMs: Date.now() - start,
      noteIds: allNoteIds,
    };
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

  private processBatch(batch: NormalizedEvent[]): {
    processed: number;
    errors: number;
    noteIds: number[];
  } {
    return this.eventWriter.writeBatch(batch);
  }

  /**
   * Remove notes that were previously ingested by a file-based plugin
   * but are no longer present in the source directory.
   */
  private cleanupStaleNotes(pluginId: string, currentPaths: Set<string>): number {
    const existingNotes = this.repository.getNotesBySourcePlugin(pluginId);
    const staleIds = existingNotes.filter((n) => !currentPaths.has(n.file_path)).map((n) => n.id);
    if (staleIds.length > 0) {
      return this.repository.deleteNotesByIds(staleIds);
    }
    return 0;
  }
}
