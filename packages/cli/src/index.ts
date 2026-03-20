#!/usr/bin/env node
import { Command } from "commander";
import { VERSION } from "@knowledgine/core";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { setupCommand } from "./commands/setup.js";
import { statusCommand } from "./commands/status.js";

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
  1. knowledgine init --path ~/notes    Index your files
  2. knowledgine setup --target claude-desktop  Configure AI tool
  3. knowledgine start --path ~/notes    Start MCP server

Run 'knowledgine <command> --help' for more information on a command.`,
  );

program
  .command("init")
  .description("Scan and index markdown files, download embedding model")
  .option("--path <dir>", "Root directory to scan")
  .option("--skip-embeddings", "Skip embedding model download and generation")
  .addHelpText(
    "after",
    `
Examples:
  knowledgine init --path ~/notes
  knowledgine init --path ~/project --skip-embeddings`,
  )
  .action(initCommand);

program
  .command("start")
  .description("Start MCP server with file watching")
  .option("--path <dir>", "Root directory to serve")
  .addHelpText(
    "after",
    `
Example:
  knowledgine start --path ~/notes`,
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

program.parse();
