import type Database from "better-sqlite3";
import type { KnowledgeRepository } from "@knowledgine/core";
import type { IngestSummary, NormalizedEvent, SkipReason } from "./types.js";
import type { PluginRegistry } from "./plugin-registry.js";
import { CursorStore } from "./cursor-store.js";
import { EventWriter } from "./event-writer.js";
import { getHeapUsageRatio, getAdaptiveBatchSize } from "./heap-monitor.js";

const DEFAULT_BATCH_SIZE = 50;

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
    options?: {
      full?: boolean;
      pluginConfig?: Record<string, unknown>;
      verbose?: boolean;
      quiet?: boolean;
    },
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
      const initResult = await plugin.initialize(options.pluginConfig);
      if (initResult && initResult.ok === false) {
        throw new Error(
          `Plugin initialization failed for "${pluginId}": ${initResult.error ?? "unknown error"}`,
        );
      }
    }

    const cursor = options?.full ? undefined : this.cursorStore.getCursor(pluginId, sourcePath);
    const generator = cursor
      ? plugin.ingestIncremental(sourcePath, cursor.checkpoint)
      : plugin.ingestAll(sourcePath);

    const processedPaths = new Set<string>();
    let batch: NormalizedEvent[] = [];
    let heapWarned = false;
    let totalEventsFromGenerator = 0;
    for await (const event of generator) {
      totalEventsFromGenerator++;
      if (!event.content || event.content.trim() === "") {
        skipped++;
        if (options?.verbose) {
          process.stderr.write(`  [skip] empty content: ${event.sourceUri}\n`);
        }
        continue;
      }
      if (event.metadata.skippedReason === "large_diff") {
        skippedLargeDiff++;
        if (options?.verbose) {
          process.stderr.write(
            `  [skip] large diff (metadata only): ${event.sourceUri} — ${event.title}\n`,
          );
        }
      }
      batch.push(event);
      processedPaths.add(event.sourceUri);

      const heapRatio = getHeapUsageRatio();
      const currentBatchSize = getAdaptiveBatchSize(DEFAULT_BATCH_SIZE, heapRatio);

      if (!heapWarned && heapRatio > 0.8) {
        heapWarned = true;
        process.stderr.write(
          `  ⚠ High heap usage (${(heapRatio * 100).toFixed(0)}%). ` +
            `Reducing batch size to ${currentBatchSize}. ` +
            `Consider: NODE_OPTIONS='--max-old-space-size=4096' knowledgine init\n`,
        );
      }

      if (batch.length >= currentBatchSize) {
        const result = this.processBatch(batch);
        processed += result.processed;
        errors += result.errors;
        allNoteIds.push(...result.noteIds);
        batch = [];
        global.gc?.();
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

    let skipReason: SkipReason | undefined;
    if (processed === 0) {
      if (totalEventsFromGenerator === 0 && cursor) {
        skipReason = "already_indexed";
      } else if (totalEventsFromGenerator === 0) {
        skipReason = "no_source_data";
      } else if (skipped > 0 || errors > 0) {
        skipReason = "all_filtered";
      }
    }

    return {
      pluginId,
      processed,
      errors,
      deleted,
      skipped,
      ...(skippedLargeDiff > 0 ? { skippedLargeDiff } : {}),
      ...(skipReason ? { skipReason } : {}),
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
