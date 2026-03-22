#!/usr/bin/env node
import { Command } from "commander";
import { VERSION } from "@knowledgine/core";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { setupCommand } from "./commands/setup.js";
import { statusCommand } from "./commands/status.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { ingestCommand } from "./commands/ingest.js";
import { pluginsListCommand, pluginsStatusCommand } from "./commands/plugins.js";
import {
  feedbackListCommand,
  feedbackApplyCommand,
  feedbackDismissCommand,
  feedbackStatsCommand,
} from "./commands/feedback.js";
import { demoCommand } from "./commands/demo.js";
import { searchCommand } from "./commands/search.js";
import { captureCommand } from "./commands/capture.js";
import { registerToolCommands } from "./commands/tool.js";

const program = new Command();

program
  .name("knowledgine")
  .description(
    "Developer Knowledge Infrastructure - Extract structured knowledge from your codebase",
  )
  .version(VERSION)
  .addHelpText(
    "after",
    `
Workflow:
  1. knowledgine init --path ~/notes    Index your files (FTS5 full-text search)
  2. knowledgine setup --target claude-desktop  Configure AI tool
  3. knowledgine start --path ~/notes    Start MCP server

Optional:
  knowledgine upgrade --semantic         Enable semantic search (downloads ~23MB model)

Run 'knowledgine <command> --help' for more information on a command.`,
  );

program
  .command("init")
  .description("Scan and index markdown files (FTS5 full-text search by default)")
  .option("--path <dir>", "Root directory to scan")
  .option("--semantic", "Enable semantic search (download model + generate embeddings)")
  .option("--skip-embeddings", "[deprecated] Use default behavior instead (embeddings are now opt-in)")
  .option("--demo", "Initialize with sample demo notes")
  .addHelpText(
    "after",
    `
Examples:
  knowledgine init --path ~/notes
  knowledgine init --path ~/project --semantic
  knowledgine init --demo`,
  )
  .action(initCommand);

program
  .command("start")
  .description("Start MCP server with file watching")
  .option("--path <dir>", "Root directory to serve")
  .option("--ingest", "Enable IngestEngine for all plugins")
  .addHelpText(
    "after",
    `
Example:
  knowledgine start --path ~/notes
  knowledgine start --path ~/notes --ingest`,
  )
  .action(startCommand);

program
  .command("setup")
  .description("Generate MCP configuration for AI tools")
  .option("--target <tool>", "Target AI tool (claude-desktop, cursor)")
  .option("--path <dir>", "Root directory of indexed notes")
  .option("--write", "Write configuration to file (default: dry-run)")
  .addHelpText(
    "after",
    `
Examples:
  knowledgine setup --target claude-desktop --path ~/notes
  knowledgine setup --target cursor --path ~/notes --write`,
  )
  .action(setupCommand);

program
  .command("status")
  .description("Check knowledgine setup and configuration status")
  .option("--path <dir>", "Root directory to check")
  .addHelpText(
    "after",
    `
Example:
  knowledgine status --path ~/notes`,
  )
  .action(statusCommand);

program
  .command("upgrade")
  .description("Upgrade knowledgine capabilities")
  .option("--semantic", "Enable semantic search (download model + generate embeddings)")
  .option("--path <dir>", "Root directory")
  .addHelpText(
    "after",
    `
Example:
  knowledgine upgrade --semantic --path ~/notes`,
  )
  .action(upgradeCommand);

program
  .command("ingest")
  .description("Ingest knowledge from configured sources")
  .option("--source <pluginId>", "Specific plugin to run")
  .option("--path <dir>", "Root directory")
  .option("--full", "Force full re-ingest (ignore cursor)")
  .option("--all", "Run all registered plugins")
  .option("--repo <owner/repo>", "GitHub repository (required for --source github)")
  .addHelpText(
    "after",
    `
Examples:
  knowledgine ingest --source markdown --path ~/notes
  knowledgine ingest --source github --repo owner/repo --path ~/notes
  knowledgine ingest --source claude-sessions --path ~/notes
  knowledgine ingest --all --path ~/notes
  knowledgine ingest --source markdown --full --path ~/notes`,
  )
  .action(ingestCommand);

const pluginsCmd = program
  .command("plugins")
  .description("Manage ingest plugins");
pluginsCmd
  .command("list")
  .description("List registered plugins")
  .action(pluginsListCommand);
pluginsCmd
  .command("status")
  .option("--path <dir>", "Root directory")
  .description("Show plugin ingest status")
  .action(pluginsStatusCommand);

const feedbackCmd = program
  .command("feedback")
  .description("Manage extraction feedback");
feedbackCmd
  .command("list")
  .description("List feedback records")
  .option("--status <status>", "Filter by status (pending, applied, dismissed)")
  .option("--path <dir>", "Root directory")
  .action(feedbackListCommand);
feedbackCmd
  .command("apply <id>")
  .description("Apply feedback and update extraction rules")
  .option("--path <dir>", "Root directory")
  .action(feedbackApplyCommand);
feedbackCmd
  .command("dismiss <id>")
  .description("Dismiss feedback without applying")
  .option("--path <dir>", "Root directory")
  .action(feedbackDismissCommand);
feedbackCmd
  .command("stats")
  .description("Show feedback statistics")
  .option("--path <dir>", "Root directory")
  .action(feedbackStatsCommand);

program
  .command("demo")
  .description("Show demo usage information or clean up demo files")
  .option("--clean", "Remove demo notes and data")
  .action(demoCommand);

program
  .command("search <query>")
  .description("Search indexed notes")
  .option("--demo", "Search in demo notes")
  .option("--mode <mode>", "Search mode: keyword, semantic, hybrid", "keyword")
  .option("--limit <n>", "Maximum results", "20")
  .option("--format <format>", "Output format: json, table, plain", "plain")
  .option("--related <noteId>", "Find related notes by note ID")
  .option("--related-file <path>", "Find related notes by file path")
  .option("--path <dir>", "Root directory")
  .action((query: string, opts: { demo?: boolean; mode?: string; limit?: string; format?: string; related?: string; relatedFile?: string; path?: string }) => {
    return searchCommand(query, {
      demo: opts.demo,
      mode: opts.mode,
      limit: Number(opts.limit),
      format: opts.format,
      related: opts.related,
      relatedFile: opts.relatedFile,
      path: opts.path,
    });
  });

program
  .command("capture [text]")
  .description("Capture knowledge from text, URL, or file")
  .option("-u, --url <url>", "URL to fetch and capture")
  .option("-f, --file <path>", "File path to capture")
  .option("-t, --tags <tags>", "Comma-separated tags")
  .option("--title <title>", "Title for the captured knowledge")
  .option("--path <dir>", "Root directory")
  .option("--format <format>", "Output format: json, plain", "plain")
  .action(captureCommand);

registerToolCommands(program);

program.parse();
