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
  feedbackReportCommand,
} from "./commands/feedback.js";
import { demoCommand } from "./commands/demo.js";
import { searchCommand } from "./commands/search.js";
import { captureAddCommand, captureListCommand, captureDeleteCommand } from "./commands/capture.js";
import { registerToolCommands } from "./commands/tool.js";
import { registerRecallCommand } from "./commands/recall.js";
import { registerExplainCommand } from "./commands/explain.js";
import { registerSuggestCommand } from "./commands/suggest.js";
import { registerFeedbackSuggestCommand } from "./commands/feedback-suggest.js";
import { registerServeCommand } from "./commands/serve.js";
import { deprecationCheckCommand } from "./commands/deprecation-check.js";
import { undeprecateCommand } from "./commands/undeprecate.js";
import { createOutputErrorHandler } from "./lib/unknown-command-handler.js";

const program = new Command();

program
  .name("knowledgine")
  .description(
    "Developer Knowledge Infrastructure - Extract structured knowledge from your codebase",
  )
  .version(`v${VERSION} (node ${process.version})`)
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
  .option("--no-semantic", "Skip semantic search setup entirely")
  .option(
    "--skip-embeddings",
    "[deprecated] Use default behavior instead (embeddings are now opt-in)",
  )
  .option("--demo", "Initialize with sample demo notes")
  .option("--force", "Skip confirmation prompts", false)
  .option("-y, --yes", "Automatically answer yes to all prompts")
  .option("--save-config", "Save defaultPath to .knowledginerc.json in current directory")
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
  .option("--no-watch", "Disable file watcher (useful for large repos to avoid EMFILE errors)")
  .addHelpText(
    "after",
    `
Example:
  knowledgine start --path ~/notes
  knowledgine start --path ~/notes --ingest
  knowledgine start --path ~/notes --no-watch`,
  )
  .action(startCommand);

program
  .command("setup")
  .description("Configure MCP, rules, and skills for AI tools")
  .option("--target <tool>", "Target AI tool (claude-desktop, cursor, claude-code)")
  .option("--path <dir>", "Root directory of indexed notes")
  .option("--write", "Write configuration to file (default: dry-run)")
  .option("--rules", "Configure agent rules (instruction files)")
  .option("--skills", "Install agent skill packages (SKILL.md)")
  .addHelpText(
    "after",
    `
Examples:
  knowledgine setup                                        Interactive 3-step setup
  knowledgine setup --target cursor --path ~/notes --write MCP config
  knowledgine setup --rules --target cursor --write        Agent rules
  knowledgine setup --skills --target cursor --write       Agent skills`,
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
  .option("--limit <n>", "Limit number of items (e.g., commits for git-history)", parseInt)
  .option("--since <date>", "Filter by date (e.g., 2025-01-01, for git-history)")
  .option("--unlimited", "Disable default limits (git-history)")
  .addHelpText(
    "after",
    `
Examples:
  knowledgine ingest --source markdown --path ~/notes
  knowledgine ingest --source github --repo owner/repo --path ~/notes
  knowledgine ingest --source claude-sessions --path ~/notes
  knowledgine ingest --all --path ~/notes
  knowledgine ingest --source markdown --full --path ~/notes
  knowledgine ingest --source git-history --limit 500 --path ~/notes
  knowledgine ingest --source git-history --since 2025-01-01 --path ~/notes
  knowledgine ingest --source git-history --unlimited --path ~/notes

Source-specific options:
  --source github --repo owner/repo  Ingest GitHub PRs and issues (requires GITHUB_TOKEN env var)
  --limit <n>                        Limit number of commits (git-history, default: 100)
  --since <date>                     Filter commits by date (git-history)
  --unlimited                        Disable default commit limit (git-history)`,
  )
  .action(ingestCommand);

const pluginsCmd = program.command("plugins").description("Manage ingest plugins");
pluginsCmd.command("list").description("List registered plugins").action(pluginsListCommand);
pluginsCmd
  .command("status")
  .option("--path <dir>", "Root directory")
  .description("Show plugin ingest status")
  .action(pluginsStatusCommand);

const feedbackCmd = program.command("feedback").description("Manage extraction feedback");
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
feedbackCmd
  .command("report")
  .description("Report an entity extraction error")
  .requiredOption("--entity <name>", "Entity name")
  .requiredOption("--type <errorType>", "Error type: false_positive, wrong_type, missed_entity")
  .option("--entity-type <type>", "Current entity type")
  .option("--correct-type <type>", "Correct entity type (for wrong_type)")
  .option("--details <text>", "Additional details")
  .option("--path <dir>", "Root directory")
  .action(feedbackReportCommand);

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
  .option(
    "--no-fallback",
    "Exit with error if requested search mode is unavailable (instead of falling back to keyword)",
  )
  .option("--agentic", "Include deprecated notes in search results (agentic mode)")
  .option("--include-deprecated", "Include deprecated notes in search results")
  .action(
    (
      query: string,
      opts: {
        demo?: boolean;
        mode?: string;
        limit?: string;
        format?: string;
        related?: string;
        relatedFile?: string;
        path?: string;
        fallback?: boolean;
        agentic?: boolean;
        includeDeprecated?: boolean;
      },
    ) => {
      return searchCommand(query, {
        demo: opts.demo,
        mode: opts.mode,
        limit: Number(opts.limit),
        format: opts.format,
        related: opts.related,
        relatedFile: opts.relatedFile,
        path: opts.path,
        fallback: opts.fallback,
        agentic: opts.agentic,
        includeDeprecated: opts.includeDeprecated,
      });
    },
  );

const captureCmd = program.command("capture").description("Capture and manage knowledge snippets");
captureCmd
  .command("add [text]")
  .description("Capture knowledge from text, URL, or file")
  .option("-u, --url <url>", "URL to fetch and capture")
  .option("-f, --file <path>", "File path to capture")
  .option("-t, --tags <tags>", "Comma-separated tags")
  .option("--title <title>", "Title for the captured knowledge")
  .option("--path <dir>", "Root directory")
  .option("--format <format>", "Output format: json, plain", "plain")
  .action(captureAddCommand);
captureCmd
  .command("list")
  .description("List captured notes")
  .option("--path <dir>", "Root directory")
  .option("--format <format>", "Output format: json, plain", "plain")
  .action(captureListCommand);
captureCmd
  .command("delete <id>")
  .description("Delete a captured note")
  .option("--path <dir>", "Root directory")
  .action(captureDeleteCommand);

registerToolCommands(program);
registerRecallCommand(program);
registerExplainCommand(program);
registerSuggestCommand(program);
registerFeedbackSuggestCommand(program);
registerServeCommand(program);

program
  .command("deprecation-check")
  .description("Find notes that may be outdated and should be deprecated")
  .option("--path <dir>", "Root directory")
  .option("--apply", "Apply deprecation (default: dry-run)")
  .option("--threshold <n>", "Similarity threshold (0-1, default: 0.8)", "0.8")
  .action(deprecationCheckCommand);

program
  .command("undeprecate <noteId>")
  .description("Restore a deprecated note to active status")
  .option("--path <dir>", "Root directory")
  .action(undeprecateCommand);

program.showSuggestionAfterError(true);
program.configureOutput({
  outputError: createOutputErrorHandler(() => program.commands.map((c) => c.name())),
});

// Global error handler for unhandled exceptions (e.g., native module errors)
process.on("uncaughtException", (error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

program.parse();
