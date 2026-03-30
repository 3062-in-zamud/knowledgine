import { resolve } from "path";
import { existsSync } from "fs";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  ALL_MIGRATIONS,
  KnowledgeRepository,
  GraphRepository,
  KnowledgeService,
  ProvenanceRepository,
  CausalLinkDetector,
} from "@knowledgine/core";
import type { EntityWithGraph } from "@knowledgine/core";
import type { ProvenanceRecord } from "@knowledgine/core";
import type { Command } from "commander";

export interface ExplainCommandOptions {
  entity?: string;
  noteId?: string;
  timeline?: boolean;
  format?: string;
  path?: string;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatPlain(
  entityName: string,
  entityGraph: EntityWithGraph,
  provenance: ProvenanceRecord[],
): string {
  const lines: string[] = [];

  lines.push(`Entity: ${entityGraph.name}`);
  const typeDisplay =
    entityGraph.entityType === "unknown"
      ? `unknown (detected in ${entityGraph.linkedNotes.length} note${entityGraph.linkedNotes.length !== 1 ? "s" : ""}, type not yet classified)`
      : entityGraph.entityType;
  lines.push(`Type: ${typeDisplay}`);
  if (entityGraph.description) {
    lines.push(`Description: ${entityGraph.description}`);
  }
  lines.push("");

  const noteCount = entityGraph.linkedNotes.length;
  const relationCount = entityGraph.outgoingRelations.length + entityGraph.incomingRelations.length;
  lines.push(`Related notes: ${noteCount}`);
  lines.push(
    `Graph relations: ${relationCount} ${relationCount === 1 ? "entity" : "entities"} connected`,
  );
  lines.push("");

  if (provenance.length > 0) {
    lines.push("Provenance:");
    const sorted = [...provenance].sort(
      (a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime(),
    );
    for (const p of sorted) {
      const msg =
        p.metadata && typeof p.metadata["message"] === "string" ? p.metadata["message"] : "";
      const agent = p.agent ?? p.activityType;
      lines.push(
        `  ${formatDate(p.generatedAt)} [${p.activityType}] ${agent}${msg ? ` → ${msg}` : ""}`,
      );
    }
    lines.push("");
  }

  // Observations
  if (entityGraph.observations.length > 0) {
    lines.push(`Observations: ${entityGraph.observations.length} recorded`);
  }

  return lines.join("\n");
}

function formatCausalLinks(noteId: number, repository: KnowledgeRepository): string {
  const links = repository.getLinksForNote(noteId);
  if (links.length === 0) return "";

  const lines: string[] = ["Causal Links:"];
  for (const link of links) {
    const sourceNote = repository.getNoteById(link.sourceNoteId);
    const targetNote = repository.getNoteById(link.targetNoteId);
    const sourcePath = sourceNote?.file_path ?? `note#${link.sourceNoteId}`;
    const targetPath = targetNote?.file_path ?? `note#${link.targetNoteId}`;
    lines.push(`  ${sourcePath} -> ${targetPath} (${link.linkType})`);
  }
  return lines.join("\n");
}

function formatTimeline(
  entityName: string,
  entityGraph: EntityWithGraph,
  provenance: ProvenanceRecord[],
  causalLinksText?: string,
): string {
  const lines: string[] = [];

  lines.push(`Timeline for "${entityGraph.name}":`);
  lines.push("");

  const sorted = [...provenance].sort(
    (a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime(),
  );

  for (const p of sorted) {
    const msg =
      p.metadata && typeof p.metadata["message"] === "string" ? p.metadata["message"] : "";
    const source = p.sourceUri ? ` ${p.sourceUri}` : "";
    lines.push(`  ${formatDate(p.generatedAt)} ✦ [${p.activityType}]${source}`);
    if (msg) {
      lines.push(`    → "${msg}"`);
    }
  }

  if (sorted.length === 0) {
    lines.push("  (No provenance records)");
  }

  lines.push("");

  const noteCount = entityGraph.linkedNotes.length;
  const relationCount = entityGraph.outgoingRelations.length + entityGraph.incomingRelations.length;
  const obsCount = entityGraph.observations.length;

  lines.push(
    `  Current: ${noteCount} notes | ${relationCount} entity relations | ${obsCount} observations`,
  );

  if (causalLinksText) {
    lines.push("");
    lines.push(causalLinksText);
  }

  return lines.join("\n");
}

function formatJson(
  entityGraph: EntityWithGraph,
  provenance: ProvenanceRecord[],
  relatedResult?: import("@knowledgine/core").FindRelatedResult,
): string {
  const output = {
    entity: {
      name: entityGraph.name,
      type: entityGraph.entityType,
      description: entityGraph.description,
      createdAt: entityGraph.createdAt,
    },
    graph: {
      observations: entityGraph.observations,
      relations: [
        ...entityGraph.outgoingRelations.map((r) => ({
          direction: "outgoing",
          relationType: r.relationType,
          target: r.targetEntity,
        })),
        ...entityGraph.incomingRelations.map((r) => ({
          direction: "incoming",
          relationType: r.relationType,
          source: r.sourceEntity,
        })),
      ],
    },
    provenance,
    related: relatedResult
      ? {
          notes: relatedResult.relatedNotes,
          psp: relatedResult.problemSolutionPairs,
        }
      : {
          notes: entityGraph.linkedNotes,
          psp: [],
        },
  };
  return JSON.stringify(output, null, 2);
}

async function explainAction(
  query: string | undefined,
  options: ExplainCommandOptions,
): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const knowledgineDir = resolve(rootPath, ".knowledgine");

  if (!existsSync(knowledgineDir)) {
    console.error('Not initialized. Run "knowledgine init --path <dir>" first.');
    process.exitCode = 1;
    return;
  }

  const format = options.format ?? "plain";
  if (!["json", "yaml", "plain"].includes(format)) {
    console.error("Error: --format must be one of: json, yaml, plain");
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);

  try {
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const graphRepository = new GraphRepository(db);
    const service = new KnowledgeService({ repository, rootPath, graphRepository });
    const provenanceRepo = new ProvenanceRepository(db);

    // --note-id モード
    if (options.noteId !== undefined) {
      const noteId = parseInt(options.noteId, 10);
      if (isNaN(noteId) || noteId < 1) {
        console.error("Error: --note-id must be a positive integer");
        process.exitCode = 1;
        return;
      }

      const result = await service.findRelated({ noteId });

      if (format === "json") {
        console.log(JSON.stringify({ noteId, related: result }, null, 2));
      } else {
        const lines: string[] = [];
        lines.push(`Note ID: ${noteId}`);
        lines.push("");

        if (result.graphRelations.length > 0) {
          lines.push("Knowledge Graph Relations:");
          for (const g of result.graphRelations) {
            lines.push(`  [${g.entityType}] ${g.name}`);
          }
          lines.push("");
        }

        if (result.relatedNotes.length > 0) {
          lines.push("Related Notes:");
          for (const n of result.relatedNotes) {
            lines.push(`  [${n.score.toFixed(2)}] ${n.filePath}  ${n.title}`);
          }
          lines.push("");
        }

        if (result.problemSolutionPairs.length > 0) {
          lines.push("Problem-Solution Pairs:");
          for (const p of result.problemSolutionPairs) {
            lines.push(
              `  [confidence: ${p.confidence.toFixed(2)}] ${p.problemPattern} → ${p.solutionPattern}`,
            );
          }
        }

        console.error(lines.join("\n"));
      }
      return;
    }

    // エンティティ名の解決
    let entityName: string | undefined;

    if (options.entity !== undefined) {
      // --entity オプション: sync
      entityName = options.entity;
    } else if (query !== undefined) {
      // [query] 引数: searchEntities (sync) → 最初の結果を使用
      const searchResult = service.searchEntities({ query });
      if (searchResult.totalResults === 0 || searchResult.entities.length === 0) {
        console.error(`Entity '${query}' not found in knowledge base.`);
        console.error(`Try: knowledgine explain --entity <name> --path <dir>`);
        process.exitCode = 1;
        return;
      }
      entityName = searchResult.entities[0].name;
    } else {
      // 引数もオプションもない
      console.error("Error: Provide a query argument, --entity <name>, or --note-id <id>");
      console.error("Usage: knowledgine explain [query] [--entity <name>] [--note-id <id>]");
      process.exitCode = 1;
      return;
    }

    // getEntityGraph (sync)
    const entityGraph = service.getEntityGraph({ entityName });

    if (!entityGraph) {
      console.error(`Entity '${entityName}' not found in knowledge base.`);
      console.error(`Try: knowledgine explain --entity <name> --path <dir>`);
      process.exitCode = 1;
      return;
    }

    // Provenance 取得
    const provenance = provenanceRepo.getByEntityUri(`entity://${entityName}`);

    // 出力
    if (format === "json") {
      console.log(formatJson(entityGraph, provenance));
    } else if (options.timeline) {
      // 因果リンク検出・表示
      const causalDetector = new CausalLinkDetector(repository);
      causalDetector.detectAll();

      // エンティティに紐づくノートの因果リンクを表示
      const linkedNoteIds = entityGraph.linkedNotes
        .map((n) => (typeof n === "object" && "id" in n ? (n as { id: number }).id : null))
        .filter((id): id is number => id !== null);

      const causalLinksText =
        linkedNoteIds.length > 0
          ? linkedNoteIds
              .map((id) => formatCausalLinks(id, repository))
              .filter((s) => s.length > 0)
              .join("\n")
          : "";

      console.error(
        formatTimeline(entityName, entityGraph, provenance, causalLinksText || undefined),
      );
    } else {
      console.error(formatPlain(entityName, entityGraph, provenance));
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

export function registerExplainCommand(program: Command): void {
  program
    .command("explain [query]")
    .description("Explain entity background with Provenance-backed timeline")
    .option("--entity <name>", "Entity name to explain")
    .option("--note-id <id>", "Note ID to explain")
    .option("--timeline", "Show chronological timeline view")
    .option("--format <format>", "Output format: json, yaml, plain", "plain")
    .option("--path <dir>", "Project root path")
    .action(explainAction);
}
