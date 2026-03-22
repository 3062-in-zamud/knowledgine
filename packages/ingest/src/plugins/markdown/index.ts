import { readdir, stat } from "fs/promises";
import { join, relative } from "path";
import { FileProcessor } from "@knowledgine/core";
import type {
  IngestPlugin,
  PluginManifest,
  TriggerConfig,
  PluginConfig,
  PluginInitResult,
  NormalizedEvent,
  SourceURI,
} from "../../types.js";

export class MarkdownPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "markdown",
    name: "Markdown Files",
    version: "0.1.0",
    schemes: ["file://"],
    priority: 0,
  };

  readonly triggers: TriggerConfig[] = [
    { type: "file_watcher", paths: ["**/*.md"] },
  ];

  private fileProcessor = new FileProcessor();

  async initialize(_config?: PluginConfig): Promise<PluginInitResult> {
    return { ok: true };
  }

  async *ingestAll(sourcePath: SourceURI): AsyncGenerator<NormalizedEvent> {
    const mdFiles = await this.findMarkdownFiles(sourcePath);
    for (const filePath of mdFiles) {
      const event = await this.processFile(filePath, sourcePath);
      if (event) yield event;
    }
  }

  async *ingestIncremental(
    sourcePath: SourceURI,
    checkpoint: string
  ): AsyncGenerator<NormalizedEvent> {
    const sinceDate = new Date(checkpoint);
    const mdFiles = await this.findMarkdownFiles(sourcePath);
    for (const filePath of mdFiles) {
      const fileStat = await stat(filePath);
      if (fileStat.mtimeMs > sinceDate.getTime()) {
        const event = await this.processFile(filePath, sourcePath);
        if (event) yield event;
      }
    }
  }

  async getCurrentCheckpoint(_sourcePath: SourceURI): Promise<string> {
    return new Date().toISOString();
  }

  async dispose(): Promise<void> {
    // no-op
  }

  private async processFile(
    filePath: string,
    basePath: string
  ): Promise<NormalizedEvent | null> {
    try {
      const processed = await this.fileProcessor.processFile(filePath);
      const title = this.fileProcessor.extractTitle(
        processed.content,
        filePath
      );
      const relativePath = relative(basePath, filePath);
      const fileStat = await stat(filePath);

      return {
        sourceUri: relativePath,
        eventType: "document",
        title,
        content: processed.content,
        timestamp: fileStat.mtime,
        metadata: {
          sourcePlugin: "markdown",
          sourceId: relativePath,
          tags: this.extractTags(processed.frontmatter),
        },
        relatedPaths: [relativePath],
        rawData: processed.frontmatter,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ⚠ Skipped (read error): ${relative(basePath, filePath)}: ${msg}\n`);
      return null;
    }
  }

  private extractTags(frontmatter: Record<string, unknown>): string[] {
    const tags = frontmatter.tags;
    if (Array.isArray(tags)) {
      return tags.filter((t): t is string => typeof t === "string");
    }
    return [];
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    await this.walkDir(dir, results);
    return results;
  }

  private async walkDir(dir: string, results: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
          await this.walkDir(fullPath, results);
        }
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }
}
