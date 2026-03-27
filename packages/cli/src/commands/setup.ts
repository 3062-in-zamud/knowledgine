import { resolve, join } from "path";
import { existsSync } from "fs";
import { homedir } from "os";
import { resolveDefaultPath } from "@knowledgine/core";
import { createBox, colors, symbols } from "../lib/ui/index.js";
import * as p from "@clack/prompts";
import * as TOML from "smol-toml";
import { interactiveRulesSetup, nonInteractiveRulesSetup } from "./setup-rules.js";
import { interactiveSkillsSetup, nonInteractiveSkillsSetup } from "./setup-skills.js";
import {
  readTextFileIfExists,
  writeTextFileAtomically,
} from "../lib/file-utils.js";

export interface SetupOptions {
  target?: string;
  path?: string;
  dryRun?: boolean;
  write?: boolean;
  rules?: boolean;
  skills?: boolean;
}

interface McpServerConfig {
  command: string;
  args: string[];
}

interface McpConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

export const TARGETS = [
  { value: "claude-desktop", label: "Claude Desktop", description: "Anthropic's desktop app" },
  { value: "cursor", label: "Cursor", description: "AI-first code editor" },
  { value: "claude-code", label: "Claude Code", description: "CLI agent for developers" },
  { value: "windsurf", label: "Windsurf", description: "Codeium's AI IDE" },
  { value: "vscode", label: "VS Code", description: "GitHub Copilot MCP" },
  { value: "zed", label: "Zed", description: "High-performance editor" },
  { value: "codex", label: "Codex CLI", description: "OpenAI's coding agent" },
  { value: "github-copilot", label: "GitHub Copilot CLI", description: "AI pair programmer CLI" },
  { value: "gemini", label: "Gemini CLI", description: "Google's AI coding agent" },
  { value: "antigravity", label: "Antigravity", description: "Google's AI development platform" },
  { value: "opencode", label: "OpenCode", description: "opencode.ai MCP configuration" },
  { value: "cline", label: "Cline", description: "Cline VS Code extension MCP configuration" },
  { value: "continue", label: "Continue", description: "Continue.dev MCP configuration" },
] as const;

type TargetValue = (typeof TARGETS)[number]["value"];

// Zed uses "context_servers" key instead of "mcpServers"
const ZED_MCP_KEY = "context_servers";

export function getConfigPath(target: string): string {
  const home = homedir();
  const appdata = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");

  switch (target as TargetValue) {
    case "claude-desktop":
      switch (process.platform) {
        case "darwin":
          return join(
            home,
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json",
          );
        case "win32":
          return join(appdata, "Claude", "claude_desktop_config.json");
        default:
          return join(home, ".config", "claude", "claude_desktop_config.json");
      }
    case "cursor":
      return join(home, ".cursor", "mcp.json");
    case "claude-code":
      return join(home, ".claude.json");
    case "windsurf":
      if (process.platform === "win32") {
        return join(appdata, "Codeium", "Windsurf", "mcp_config.json");
      }
      return join(home, ".codeium", "windsurf", "mcp_config.json");
    case "vscode":
      switch (process.platform) {
        case "darwin":
          return join(home, "Library", "Application Support", "Code", "User", "settings.json");
        case "win32":
          return join(appdata, "Code", "User", "settings.json");
        default:
          return join(home, ".config", "Code", "User", "settings.json");
      }
    case "zed":
      return join(home, ".config", "zed", "settings.json");
    case "codex":
      return join(home, ".codex", "config.toml");
    case "github-copilot":
      return join(home, ".copilot", "mcp-config.json");
    case "gemini":
      return join(home, ".gemini", "settings.json");
    case "antigravity":
      return join(home, ".gemini", "antigravity", "mcp_config.json");
    case "opencode":
      return join(home, ".config", "opencode", "config.json");
    case "cline":
      switch (process.platform) {
        case "darwin":
          return join(
            home,
            "Library",
            "Application Support",
            "Code",
            "User",
            "globalStorage",
            "saoudrizwan.claude-dev",
            "settings",
            "cline_mcp_settings.json",
          );
        case "win32":
          return join(
            appdata,
            "Code",
            "User",
            "globalStorage",
            "saoudrizwan.claude-dev",
            "settings",
            "cline_mcp_settings.json",
          );
        default:
          return join(
            home,
            ".config",
            "Code",
            "User",
            "globalStorage",
            "saoudrizwan.claude-dev",
            "settings",
            "cline_mcp_settings.json",
          );
      }
    case "continue":
      return join(home, ".continue", "config.json");
    default:
      throw new Error(
        `Unknown target: ${target}. Supported: ${TARGETS.map((t) => t.value).join(", ")}`,
      );
  }
}

export function getTargetLabel(target: string): string {
  const found = TARGETS.find((t) => t.value === target);
  return found ? found.label : target;
}

function buildMcpConfig(rootPath: string): McpServerConfig {
  return {
    command: "npx",
    args: ["-y", "@knowledgine/cli", "start", "--path", rootPath],
  };
}

function isTomlConfig(configPath: string): boolean {
  return configPath.endsWith(".toml");
}

/** Get the MCP servers key name for a given target */
function getMcpKey(target: string): string {
  if (target === "zed") return ZED_MCP_KEY;
  return "mcpServers";
}

function readExistingConfig(configPath: string, target?: string): McpConfig {
  const raw = readTextFileIfExists(configPath);
  if (raw === null) {
    return {};
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    if (isTomlConfig(configPath)) {
      const parsed = TOML.parse(trimmed) as Record<string, unknown>;
      return {
        mcpServers: (parsed["mcp_servers"] ?? {}) as Record<string, McpServerConfig>,
      };
    }
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const mcpKey = getMcpKey(target ?? "");
    // For tools that embed MCP in a larger settings file (Zed, VS Code)
    if (parsed[mcpKey]) {
      return { mcpServers: parsed[mcpKey] as Record<string, McpServerConfig> };
    }
    return parsed as McpConfig;
  } catch {
    const format = isTomlConfig(configPath) ? "TOML" : "JSON";
    throw new Error(
      `Failed to parse existing config: ${configPath}\n` +
        `The file contains invalid ${format}. Fix it manually or remove it before running setup.`,
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

function writeConfig(configPath: string, config: McpConfig, target?: string): void {
  if (isTomlConfig(configPath)) {
    // TOML: read existing, merge mcp_servers, write back
    let existing: Record<string, unknown> = {};
    const raw = readTextFileIfExists(configPath);
    if (raw !== null) {
      try {
        existing = TOML.parse(raw) as Record<string, unknown>;
      } catch {
        /* start fresh */
      }
    }
    existing["mcp_servers"] = {
      ...((existing["mcp_servers"] as Record<string, unknown>) ?? {}),
      knowledgine: config.mcpServers?.["knowledgine"] ?? buildMcpConfig(""),
    };
    writeTextFileAtomically(configPath, TOML.stringify(existing) + "\n");
  } else {
    const mcpKey = getMcpKey(target ?? "");
    const isEmbeddedSettings =
      mcpKey !== "mcpServers" || target === "vscode" || target === "gemini";

    if (isEmbeddedSettings) {
      // Zed/VS Code: merge into existing settings.json
      let existing: Record<string, unknown> = {};
      const raw = readTextFileIfExists(configPath);
      if (raw !== null) {
        try {
          existing = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          /* start fresh */
        }
      }
      existing[mcpKey] = {
        ...((existing[mcpKey] as Record<string, unknown>) ?? {}),
        knowledgine: config.mcpServers?.["knowledgine"] ?? buildMcpConfig(""),
      };
      writeTextFileAtomically(configPath, JSON.stringify(existing, null, 2) + "\n");
    } else {
      writeTextFileAtomically(configPath, JSON.stringify(config, null, 2) + "\n");
    }
  }
}

function isTTY(): boolean {
  // Check both stdin and stdout for interactive prompt support
  return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}

// Tools that support project-level config (in project root directory)
export const PROJECT_CONFIG_SUPPORT: Record<string, (projectRoot: string) => string> = {
  cursor: (root) => join(root, ".cursor", "mcp.json"),
  "claude-code": (root) => join(root, ".mcp.json"),
  vscode: (root) => join(root, ".vscode", "mcp.json"),
  windsurf: (root) => join(root, ".windsurf", "mcp_config.json"),
  gemini: (root) => join(root, ".gemini", "settings.json"),
};

function getConfigPathForScope(
  target: string,
  scope: "global" | "project",
  projectRoot: string,
): string {
  if (scope === "project") {
    const projectFn = PROJECT_CONFIG_SUPPORT[target];
    if (projectFn) return projectFn(projectRoot);
  }
  return getConfigPath(target);
}

async function interactiveSetup(rootPath: string): Promise<void> {
  p.intro(colors.bold("knowledgine Setup"));

  // Step 1: Select tools
  const selectedTargets = await p.multiselect({
    message: "Which AI tools do you use? (space to select, enter to confirm)",
    options: TARGETS.map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.description,
    })),
    required: true,
  });

  if (p.isCancel(selectedTargets)) {
    p.cancel("Setup cancelled.");
    return;
  }

  const targets = selectedTargets as string[];

  // Step 2: Select scope (only if any selected tool supports project-level config)
  const hasProjectSupport = targets.some((t) => t in PROJECT_CONFIG_SUPPORT);
  let scope: "global" | "project" = "global";

  if (hasProjectSupport) {
    const scopeResult = await p.select({
      message: "Where should the config be installed?",
      options: [
        {
          value: "global",
          label: "Global",
          hint: `User-level config (~/) — works everywhere`,
        },
        {
          value: "project",
          label: "Project",
          hint: `Project-level config (./) — scoped to this workspace`,
        },
      ],
    });

    if (p.isCancel(scopeResult)) {
      p.cancel("Setup cancelled.");
      return;
    }
    scope = scopeResult as "global" | "project";
  }

  // Step 3: Configure each tool
  const s = p.spinner();
  const results: {
    target: string;
    status: "ok" | "fail";
    configPath: string;
    error?: string;
    note?: string;
  }[] = [];

  for (const target of targets) {
    const targetLabel = getTargetLabel(target);
    const useProject = scope === "project" && target in PROJECT_CONFIG_SUPPORT;
    const actualScope = useProject ? "project" : "global";
    s.start(`Configuring ${targetLabel} (${actualScope})...`);

    try {
      const configPath = getConfigPathForScope(target, scope, rootPath);
      const existingConfig = readExistingConfig(configPath, target);
      const mergedConfig = mergeConfig(existingConfig, rootPath);
      writeConfig(configPath, mergedConfig, target);
      s.stop(`${symbols.success} ${colors.success(targetLabel)} configured (${actualScope})`);
      const note =
        !useProject && scope === "project"
          ? "project config not supported, used global"
          : undefined;
      results.push({ target, status: "ok", configPath, note });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      s.stop(`${symbols.error} ${colors.error(targetLabel)} failed`);
      results.push({ target, status: "fail", configPath: "", error: msg });
    }
  }

  // MCP Summary
  const ok = results.filter((r) => r.status === "ok");
  const fail = results.filter((r) => r.status === "fail");

  if (ok.length > 0) {
    const lines = ok.map((r) => {
      const extra = r.note ? `  ${colors.dim(`(${r.note})`)}` : "";
      return `${symbols.success} ${getTargetLabel(r.target)}  ${colors.dim(r.configPath)}${extra}`;
    });
    p.note(lines.join("\n"), "MCP Configured");
  }

  if (fail.length > 0) {
    const lines = fail.map(
      (r) => `${symbols.error} ${getTargetLabel(r.target)}  ${colors.dim(r.error ?? "")}`,
    );
    p.note(lines.join("\n"), "MCP Failed");
  }

  // Step 4: Agent Rules
  const ruleResults = await interactiveRulesSetup(rootPath, targets);

  // Step 5: Agent Skills
  const skillResults = await interactiveSkillsSetup(rootPath, targets);

  // Final Summary
  const summaryLines: string[] = [];
  if (ok.length > 0) {
    summaryLines.push(`MCP:    ${ok.map((r) => getTargetLabel(r.target)).join(", ")}`);
  }
  if (ruleResults.length > 0) {
    const ruleOk = ruleResults.filter((r) => r.status === "ok");
    if (ruleOk.length > 0) {
      summaryLines.push(`Rules:  ${ruleOk.map((r) => r.target).join(", ")}`);
    }
  }
  if (skillResults.length > 0) {
    const skillOk = skillResults.filter((r) => r.status === "ok");
    if (skillOk.length > 0) {
      summaryLines.push(
        `Skills: ${skillOk.map((r) => `${r.target} (${r.skillCount} skills)`).join(", ")}`,
      );
    }
  }

  if (summaryLines.length > 0) {
    p.note(summaryLines.join("\n"), "Summary");
  }

  p.outro(`${colors.success("Setup complete!")} Restart your AI tools to activate knowledgine.`);
}

export interface SetupIO {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  isTTY: boolean;
}

export async function setupCommand(
  options: SetupOptions,
  ioOrCommand?: SetupIO | unknown,
): Promise<void> {
  // Commander.js passes (options, Command) — detect and ignore the Command object
  const io =
    ioOrCommand && typeof (ioOrCommand as SetupIO).isTTY === "boolean"
      ? (ioOrCommand as SetupIO)
      : undefined;

  // For --rules and --skills, default to cwd (project root), not knowledge base path
  const rulesOrSkillsOnly = options.rules || options.skills;
  const rootPath = rulesOrSkillsOnly
    ? options.path
      ? resolve(options.path)
      : process.cwd()
    : resolveDefaultPath(options.path);

  // --rules and --skills don't require knowledgine init
  const needsInit = !rulesOrSkillsOnly;

  if (needsInit) {
    const knowledgineDir = resolve(rootPath, ".knowledgine");
    if (!existsSync(knowledgineDir)) {
      console.error(
        `${symbols.error} Not initialized. Run 'knowledgine init --path ${rootPath}' first.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  // Interactive mode when no --target specified
  if (!options.target) {
    // --rules or --skills only (no --target) → use cwd as project root
    if (options.rules) {
      const tty = io ? io.isTTY : isTTY();
      if (!tty) {
        console.error("Error: --target is required in non-interactive mode.");
        process.exitCode = 1;
        return;
      }
      await interactiveRulesSetup(rootPath);
      return;
    }
    if (options.skills) {
      const tty = io ? io.isTTY : isTTY();
      if (!tty) {
        console.error("Error: --target is required in non-interactive mode.");
        process.exitCode = 1;
        return;
      }
      await interactiveSkillsSetup(rootPath);
      return;
    }

    const tty = io ? io.isTTY : isTTY();
    if (!tty) {
      console.error("Error: --target is required in non-interactive mode.");
      console.error(`  Supported targets: ${TARGETS.map((t) => t.value).join(", ")}`);
      process.exitCode = 1;
      return;
    }
    await interactiveSetup(rootPath);
    return;
  }

  const target = options.target;
  const shouldWrite = options.write === true;

  // Non-interactive: --rules flag
  if (options.rules) {
    nonInteractiveRulesSetup(target, rootPath, { write: shouldWrite });
    return;
  }

  // Non-interactive: --skills flag
  if (options.skills) {
    nonInteractiveSkillsSetup(target, rootPath, { write: shouldWrite });
    return;
  }

  // Non-interactive: MCP setup (default)
  const configPath = getConfigPath(target);
  const targetLabel = getTargetLabel(target);

  let existingConfig: McpConfig;
  try {
    existingConfig = readExistingConfig(configPath, target);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const knowledgineConfig = buildMcpConfig(rootPath);
  const otherServerCount = Object.keys(existingConfig.mcpServers ?? {}).filter(
    (k) => k !== "knowledgine",
  ).length;

  const jsonContent = JSON.stringify({ mcpServers: { knowledgine: knowledgineConfig } }, null, 2);
  const preserveNote =
    otherServerCount > 0
      ? `\n${colors.hint(`(${otherServerCount} other MCP server(s) will be preserved)`)}`
      : "";
  const boxContent = `${colors.hint(`Config: ${configPath}`)}${preserveNote}\n\n${jsonContent}`;
  console.error(
    "\n" + createBox(boxContent, { title: `MCP Configuration for ${targetLabel}`, type: "info" }),
  );

  if (!shouldWrite) {
    console.error(
      `${symbols.arrow} ${colors.hint(`To apply: Run with --write flag, then restart ${targetLabel}.`)}`,
    );
    console.error(
      `${symbols.arrow} ${colors.hint(`knowledgine setup --target ${target} --path ${rootPath} --write`)}`,
    );
    console.error("");
    console.error(
      `${symbols.arrow} ${colors.hint("Run 'knowledgine status' to verify your setup.")}`,
    );
    return;
  }

  const mergedConfig = mergeConfig(existingConfig, rootPath);
  writeConfig(configPath, mergedConfig, target);

  console.error(`${symbols.success} ${colors.success(`Config written: ${configPath}`)}`);
  console.error("");
  console.error(
    `${symbols.arrow} ${colors.hint(`Restart ${targetLabel} to activate knowledgine.`)}`,
  );
  console.error(
    `${symbols.arrow} ${colors.hint("Run 'knowledgine status' to verify your setup.")}`,
  );
}
