import { resolve, join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "fs";
import { homedir } from "os";
import { createInterface } from "readline";

export interface SetupOptions {
  target?: string;
  path?: string;
  dryRun?: boolean;
  write?: boolean;
}

interface McpServerConfig {
  command: string;
  args: string[];
}

interface McpConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

function getClaudeDesktopConfigPath(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "linux":
      return join(homedir(), ".config", "claude", "claude_desktop_config.json");
    case "win32":
      return join(process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
    default:
      return join(homedir(), ".config", "claude", "claude_desktop_config.json");
  }
}

function getCursorConfigPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

function getConfigPath(target: string): string {
  switch (target) {
    case "claude-desktop":
      return getClaudeDesktopConfigPath();
    case "cursor":
      return getCursorConfigPath();
    default:
      throw new Error(`Unknown target: ${target}. Supported: claude-desktop, cursor`);
  }
}

function getTargetLabel(target: string): string {
  switch (target) {
    case "claude-desktop":
      return "Claude Desktop";
    case "cursor":
      return "Cursor";
    default:
      return target;
  }
}

function buildMcpConfig(rootPath: string): McpServerConfig {
  return {
    command: "npx",
    args: ["-y", "@knowledgine/cli", "start", "--path", rootPath],
  };
}

function readExistingConfig(configPath: string): McpConfig {
  if (!existsSync(configPath)) {
    return {};
  }
  const raw = readFileSync(configPath, "utf-8");
  try {
    return JSON.parse(raw) as McpConfig;
  } catch {
    throw new Error(
      `Failed to parse existing config: ${configPath}\n` +
      `The file contains invalid JSON. Fix it manually or remove it before running setup.`
    );
  }
}

function mergeConfig(existing: McpConfig, rootPath: string): McpConfig {
  const serverConfig = buildMcpConfig(rootPath);
  return {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      knowledgine: serverConfig,
    },
  };
}

interface SetupIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  isTTY: boolean;
}

function getDefaultIO(): SetupIO {
  return {
    input: process.stdin,
    output: process.stderr,
    isTTY: process.stderr.isTTY ?? false,
  };
}

async function promptTarget(io: SetupIO): Promise<string> {
  const targets = [
    { value: "claude-desktop", label: "Claude Desktop" },
    { value: "cursor", label: "Cursor" },
  ];

  return new Promise<string>((resolvePrompt, reject) => {
    const rl = createInterface({
      input: io.input,
      output: io.output,
    });

    io.output.write("Select target AI tool:\n");
    for (let i = 0; i < targets.length; i++) {
      io.output.write(`  ${i + 1}) ${targets[i].label}\n`);
    }
    rl.question("Enter number (1-2): ", (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < targets.length) {
        resolvePrompt(targets[idx].value);
      } else {
        reject(new Error("Invalid selection. Run with --target to specify directly."));
      }
    });
  });
}

export async function setupCommand(
  options: SetupOptions,
  io?: SetupIO,
): Promise<void> {
  const rootPath = resolve(options.path ?? process.cwd());
  const setupIO = io ?? getDefaultIO();

  // Check initialization
  const knowledgineDir = resolve(rootPath, ".knowledgine");
  if (!existsSync(knowledgineDir)) {
    console.error(`Error: Not initialized. Run 'knowledgine init --path ${rootPath}' first.`);
    process.exitCode = 1;
    return;
  }

  // Determine target
  let target = options.target;
  if (!target) {
    if (!setupIO.isTTY) {
      console.error("Error: --target is required in non-interactive mode.");
      console.error("  Supported targets: claude-desktop, cursor");
      process.exitCode = 1;
      return;
    }
    target = await promptTarget(setupIO);
  }

  const configPath = getConfigPath(target);
  const targetLabel = getTargetLabel(target);
  const shouldWrite = options.write === true;

  // Read existing config (may throw on invalid JSON)
  let existingConfig: McpConfig;
  try {
    existingConfig = readExistingConfig(configPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const mergedConfig = mergeConfig(existingConfig, rootPath);
  const configJson = JSON.stringify(mergedConfig, null, 2);

  console.error(`\nMCP configuration for ${targetLabel}:`);
  console.error(`  Config: ${configPath}`);
  console.error("");
  console.error(configJson);
  console.error("");

  if (!shouldWrite) {
    console.error(`To apply: Run with --write flag, then restart ${targetLabel}.`);
    console.error(`  knowledgine setup --target ${target} --path ${rootPath} --write`);
    console.error("");
    console.error("Run 'knowledgine status' to verify your setup.");
    return;
  }

  // Write config
  const configDir = resolve(configPath, "..");
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Backup existing file
  if (existsSync(configPath)) {
    const backupPath = configPath + ".bak";
    copyFileSync(configPath, backupPath);
    console.error(`Backup created: ${backupPath}`);
  }

  writeFileSync(configPath, configJson + "\n", "utf-8");
  console.error(`Config written: ${configPath}`);
  console.error("");
  console.error(`Restart ${targetLabel} to activate knowledgine.`);
  console.error("Run 'knowledgine status' to verify your setup.");
}
