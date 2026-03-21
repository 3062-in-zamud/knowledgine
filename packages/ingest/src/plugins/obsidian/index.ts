import { readdir, stat, realpath } from "fs/promises";
import { join, relative, basename, resolve, dirname } from "path";
import { existsSync } from "fs";
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
import { sanitizeContent } from "../../normalizer.js";
import { parseWikiLinks, resolveWikiLinkPath } from "./wikilink-parser.js";
import {
  parseObsidianFrontmatter,
  extractInlineTags,
} from "./frontmatter-parser.js";

export class ObsidianPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "obsidian",
    name: "Obsidian Vault",
    version: "0.1.0",
    schemes: ["obsidian://"],
    priority: 1,
  };

  readonly triggers: TriggerConfig[] = [
    { type: "file_watcher", paths: ["**/*.md"] },
    { type: "manual" },
  ];

  private fileProcessor = new FileProcessor();

  async initialize(config?: PluginConfig): Promise<PluginInitResult> {
    const sourcePath = config?.sourcePath as string | undefined;
    if (sourcePath && !existsSync(join(sourcePath, ".obsidian"))) {
      return {
        ok: false,
        error: "No Obsidian vault found (.obsidian directory missing)",
      };
    }
    return { ok: true };
  }

  async *ingestAll(sourcePath: SourceURI): AsyncGenerator<NormalizedEvent> {
    if (!existsSync(join(sourcePath, ".obsidian"))) {
      return;
    }

    const mdFiles = await this.findMarkdownFiles(sourcePath);
    const vaultName = basename(sourcePath);

    for (const filePath of mdFiles) {
      const event = await this.processFile(filePath, sourcePath, vaultName);
      if (event) yield event;
    }
  }

  async *ingestIncremental(
    sourcePath: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    if (!existsSync(join(sourcePath, ".obsidian"))) {
      return;
    }

    const sinceDate = new Date(checkpoint);
    const mdFiles = await this.findMarkdownFiles(sourcePath);
    const vaultName = basename(sourcePath);

    for (const filePath of mdFiles) {
      const fileStat = await stat(filePath);
      if (fileStat.mtimeMs > sinceDate.getTime()) {
        const event = await this.processFile(filePath, sourcePath, vaultName);
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
    vaultPath: string,
    vaultName: string,
  ): Promise<NormalizedEvent | null> {
    try {
      const processed = await this.fileProcessor.processFile(filePath);
      const title =
        (processed.frontmatter.title as string) ||
        this.fileProcessor.extractTitle(processed.content, filePath);
      const relativePath = relative(vaultPath, filePath);
      const fileStat = await stat(filePath);

      // Obsidian固有処理
      const obsidianFm = parseObsidianFrontmatter(processed.frontmatter);
      const wikilinks = parseWikiLinks(processed.content);
      const inlineTags = extractInlineTags(processed.content);

      // タグ統合（重複除去）
      const allTags = [...new Set([...obsidianFm.tags, ...inlineTags])];

      // Wikilink解決
      const relatedPaths: string[] = [];
      for (const link of wikilinks) {
        if (
          !link.isEmbed ||
          !link.target.match(/\.(png|jpg|jpeg|gif|svg|webp|pdf)$/i)
        ) {
          const resolved = resolveWikiLinkPath(
            link.target,
            vaultPath,
            filePath,
          );
          if (resolved) {
            relatedPaths.push(relative(vaultPath, resolved));
          }
        }
      }

      return {
        sourceUri: `obsidian://${vaultName}/${relativePath}`,
        eventType: "document",
        title,
        content: sanitizeContent(processed.content),
        timestamp: fileStat.mtime,
        metadata: {
          sourcePlugin: "obsidian",
          sourceId: relativePath,
          tags: allTags,
          extra: {
            aliases: obsidianFm.aliases,
            wikilinks: wikilinks.map((l) => ({
              target: l.target,
              alias: l.alias,
            })),
            ...obsidianFm.custom,
          },
        },
        relatedPaths,
        rawData: processed.frontmatter,
      };
    } catch {
      return null;
    }
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    await this.walkDir(dir, dir, results);
    return results;
  }

  private async walkDir(
    dir: string,
    vaultRoot: string,
    results: string[],
  ): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    const SKIP_DIRS = new Set([
      ".obsidian",
      "node_modules",
      ".git",
      ".trash",
    ]);

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        try {
          const realPath = await realpath(fullPath);
          if (!realPath.startsWith(vaultRoot)) continue;
          const linkStat = await stat(fullPath);
          if (linkStat.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) {
              await this.walkDir(fullPath, vaultRoot, results);
            }
          } else if (entry.name.endsWith(".md")) {
            results.push(fullPath);
          }
        } catch {
          continue;
        }
      } else if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          await this.walkDir(fullPath, vaultRoot, results);
        }
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }
}
