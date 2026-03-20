import type { IngestEngine, IngestSummary, PluginRegistry } from "@knowledgine/ingest";

export interface IngestWatcherOptions {
  engine: IngestEngine;
  registry: PluginRegistry;
  rootPath: string;
  onComplete?: (summaries: IngestSummary[]) => void;
  onError?: (pluginId: string, error: Error) => void;
}

export class IngestWatcher {
  private engine: IngestEngine;
  private registry: PluginRegistry;
  private rootPath: string;
  private onComplete?: (summaries: IngestSummary[]) => void;
  private onError?: (pluginId: string, error: Error) => void;
  private running = false;

  constructor(options: IngestWatcherOptions) {
    this.engine = options.engine;
    this.registry = options.registry;
    this.rootPath = options.rootPath;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  async runInitialIngest(): Promise<IngestSummary[]> {
    this.running = true;
    const summaries: IngestSummary[] = [];

    for (const plugin of this.registry.list()) {
      if (!this.running) break;

      try {
        const summary = await this.engine.ingest(
          plugin.manifest.id,
          this.rootPath,
        );
        summaries.push(summary);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        summaries.push({
          pluginId: plugin.manifest.id,
          processed: 0,
          errors: 1,
          elapsedMs: 0,
        });
        this.onError?.(plugin.manifest.id, err);
      }
    }

    this.running = false;
    this.onComplete?.(summaries);
    return summaries;
  }

  async stop(): Promise<void> {
    this.running = false;
  }
}
