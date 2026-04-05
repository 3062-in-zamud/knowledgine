import type Database from "better-sqlite3";
import type { KnowledgeRepository, GraphRepository } from "@knowledgine/core";
import { IncrementalExtractor } from "@knowledgine/core";
import type {
  IngestSummary,
  ExtractionSummary,
  NormalizedEvent,
  SkipReason,
  IngestError,
  ErrorCategory,
  FileSkipReason,
} from "./types.js";
import type { PluginRegistry } from "./plugin-registry.js";
import { CursorStore } from "./cursor-store.js";
import { EventWriter } from "./event-writer.js";
import { getHeapUsageRatio, getAdaptiveBatchSize } from "./heap-monitor.js";
import picomatch from "picomatch";
import { classifyWithConfidence } from "./noise-filter.js";

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
    private graphRepository?: GraphRepository,
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
      excludePatterns?: string[];
      postProcessExtraction?: boolean;
    },
  ): Promise<IngestSummary> {
    const start = Date.now();
    const quiet = options?.quiet === true;
    const log = (msg: string): void => {
      if (!quiet) process.stderr.write(msg);
    };
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

    const excludeMatcher =
      options?.excludePatterns && options.excludePatterns.length > 0
        ? picomatch(options.excludePatterns)
        : null;

    const errorDetails: IngestError[] = [];
    const skippedByReason: Partial<Record<FileSkipReason, number>> = {};
    const skipDetailsList: Array<{ path: string; reason: FileSkipReason }> = [];
    const processedPaths = new Set<string>();
    let batch: NormalizedEvent[] = [];
    let heapWarned = false;
    let totalEventsFromGenerator = 0;
    for await (const event of generator) {
      totalEventsFromGenerator++;

      if (
        excludeMatcher &&
        event.relatedPaths &&
        event.relatedPaths.length > 0 &&
        event.relatedPaths.every((p) => excludeMatcher(p))
      ) {
        skipped++;
        event.metadata.skippedReason = "exclude-pattern";
        skippedByReason["excluded_pattern"] = (skippedByReason["excluded_pattern"] ?? 0) + 1;
        if (options?.verbose) {
          process.stderr.write(`  [skip] exclude-pattern match: ${event.sourceUri}\n`);
          skipDetailsList.push({ path: event.sourceUri, reason: "excluded_pattern" });
        }
        continue;
      }

      if (event.metadata.skippedReason === "api_error") {
        const extra = event.metadata.extra as
          | { errorCategory?: string; errorMessage?: string }
          | undefined;
        errorDetails.push({
          sourceUri: event.sourceUri,
          category: (extra?.errorCategory ?? "unknown") as ErrorCategory,
          message: extra?.errorMessage ?? "Unknown error",
        });
        errors++;
        if (options?.verbose) {
          process.stderr.write(
            `  [error] [${extra?.errorCategory ?? "unknown"}] ${event.sourceUri} — ${extra?.errorMessage ?? "Unknown error"}\n`,
          );
        }
        continue;
      }

      if (!event.content || event.content.trim() === "") {
        skipped++;
        const rawReason = event.metadata.skippedReason;
        const fileSkipReason: FileSkipReason =
          rawReason === "too_large" || rawReason === "read_error" ? rawReason : "empty_content";
        skippedByReason[fileSkipReason] = (skippedByReason[fileSkipReason] ?? 0) + 1;
        if (options?.verbose) {
          const label =
            fileSkipReason === "too_large"
              ? "too large"
              : fileSkipReason === "read_error"
                ? "read error"
                : "empty content";
          process.stderr.write(`  [skip] ${label}: ${event.sourceUri}\n`);
          skipDetailsList.push({ path: event.sourceUri, reason: fileSkipReason });
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
      // Set confidence based on noise classification for commit/discussion/review events.
      // Only set if not already provided by the plugin (preserve plugin-specific scoring).
      if (
        event.metadata.confidence === undefined &&
        (event.eventType === "commit" ||
          event.eventType === "discussion" ||
          event.eventType === "review")
      ) {
        const { confidence } = classifyWithConfidence(
          event.title,
          event.metadata.author ?? "",
          event.relatedPaths ?? [],
        );
        event.metadata.confidence = confidence;
      }
      batch.push(event);
      processedPaths.add(event.sourceUri);

      // Sample heap usage at batch boundaries to avoid per-event overhead
      const shouldSample = batch.length % DEFAULT_BATCH_SIZE === 0;
      const heapRatio = shouldSample ? getHeapUsageRatio() : 0;
      const currentBatchSize = shouldSample
        ? getAdaptiveBatchSize(DEFAULT_BATCH_SIZE, heapRatio)
        : DEFAULT_BATCH_SIZE;

      if (!heapWarned && heapRatio > 0.8) {
        heapWarned = true;
        log(
          `  ⚠ High heap usage (${(heapRatio * 100).toFixed(0)}%). ` +
            `Reducing batch size to ${currentBatchSize}. ` +
            `Consider: NODE_OPTIONS='--max-old-space-size=4096'\n`,
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

    let extractionSummary: ExtractionSummary | undefined;
    if (this.graphRepository && options?.postProcessExtraction !== false && allNoteIds.length > 0) {
      const extractor = new IncrementalExtractor(this.repository, this.graphRepository);
      extractionSummary = await extractor.process(allNoteIds);
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
      ...(extractionSummary ? { extractionSummary } : {}),
      ...(errorDetails.length > 0 ? { errorDetails } : {}),
      ...(Object.keys(skippedByReason).length > 0 ? { skippedByReason } : {}),
      ...(skipDetailsList.length > 0 ? { skipDetails: skipDetailsList } : {}),
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
