import { join } from "path";
import * as p from "@clack/prompts";
import { colors, symbols } from "../lib/ui/index.js";
import {
  readTextFileIfExists,
  writeTextFileAtomically,
  writeTextFileExclusively,
} from "../lib/file-utils.js";
import {
  getClaudeCodeRuleTemplate,
  getCursorRuleTemplate,
  getWindsurfRuleTemplate,
  getClineRuleTemplate,
  getCodexRuleTemplate,
  getGithubCopilotRuleTemplate,
  getGeminiRuleTemplate,
  getContinueRuleTemplate,
  getZedRuleTemplate,
  getOpencodeRuleTemplate,
  getAntigravityRuleTemplate,
} from "../templates/rules/index.js";

const MARKER_START = "<!-- knowledgine:rules:start -->";
const MARKER_END = "<!-- knowledgine:rules:end -->";

export interface RuleTarget {
  value: string;
  label: string;
  description: string;
  supported: boolean;
  getRulePath: (root: string) => string;
  strategy: "append-section" | "create-file";
  getTemplate: (root: string) => string;
  sharedFile?: string;
}

export interface RuleWriteResult {
  target: string;
  status: "ok" | "skipped" | "fail";
  filePath: string;
  error?: string;
  note?: string;
}

export const RULE_TARGETS: RuleTarget[] = [
  {
    value: "claude-code",
    label: "Claude Code",
    description: "Anthropic's CLI agent",
    supported: true,
    getRulePath: (root) => join(root, "CLAUDE.md"),
    strategy: "append-section",
    getTemplate: getClaudeCodeRuleTemplate,
  },
  {
    value: "codex",
    label: "Codex CLI",
    description: "OpenAI's coding agent",
    supported: true,
    getRulePath: (root) => join(root, "AGENTS.md"),
    strategy: "append-section",
    getTemplate: getCodexRuleTemplate,
    sharedFile: "agents-md",
  },
  {
    value: "cursor",
    label: "Cursor",
    description: "AI-first code editor",
    supported: true,
    getRulePath: (root) => join(root, ".cursor", "rules", "knowledgine.mdc"),
    strategy: "create-file",
    getTemplate: getCursorRuleTemplate,
  },
  {
    value: "windsurf",
    label: "Windsurf",
    description: "Codeium's AI IDE",
    supported: true,
    getRulePath: (root) => join(root, ".windsurf", "rules", "knowledgine.md"),
    strategy: "create-file",
    getTemplate: getWindsurfRuleTemplate,
  },
  {
    value: "cline",
    label: "Cline",
    description: "Cline VS Code extension",
    supported: true,
    getRulePath: (root) => join(root, ".clinerules", "knowledgine.md"),
    strategy: "create-file",
    getTemplate: getClineRuleTemplate,
  },
  {
    value: "github-copilot",
    label: "GitHub Copilot CLI",
    description: "AI pair programmer CLI",
    supported: true,
    getRulePath: (root) => join(root, ".github", "copilot-instructions.md"),
    strategy: "create-file",
    getTemplate: getGithubCopilotRuleTemplate,
    sharedFile: "copilot-instructions",
  },
  {
    value: "vscode",
    label: "VS Code",
    description: "GitHub Copilot MCP",
    supported: true,
    getRulePath: (root) => join(root, ".github", "copilot-instructions.md"),
    strategy: "create-file",
    getTemplate: getGithubCopilotRuleTemplate,
    sharedFile: "copilot-instructions",
  },
  {
    value: "gemini",
    label: "Gemini CLI",
    description: "Google's AI coding agent",
    supported: true,
    getRulePath: (root) => join(root, "GEMINI.md"),
    strategy: "append-section",
    getTemplate: getGeminiRuleTemplate,
    sharedFile: "gemini-md",
  },
  {
    value: "continue",
    label: "Continue",
    description: "Continue.dev MCP configuration",
    supported: true,
    getRulePath: (root) => join(root, ".continuerules"),
    strategy: "append-section",
    getTemplate: getContinueRuleTemplate,
  },
  {
    value: "zed",
    label: "Zed",
    description: "High-performance editor",
    supported: true,
    getRulePath: (root) => join(root, ".rules"),
    strategy: "create-file",
    getTemplate: getZedRuleTemplate,
  },
  {
    value: "opencode",
    label: "OpenCode",
    description: "opencode.ai MCP configuration",
    supported: true,
    getRulePath: (root) => join(root, "AGENTS.md"),
    strategy: "append-section",
    getTemplate: getOpencodeRuleTemplate,
    sharedFile: "agents-md",
  },
  {
    value: "antigravity",
    label: "Antigravity",
    description: "Google's AI development platform",
    supported: true,
    getRulePath: (root) => join(root, "AGENTS.md"),
    strategy: "append-section",
    getTemplate: getAntigravityRuleTemplate,
    sharedFile: "agents-md",
  },
  {
    value: "claude-desktop",
    label: "Claude Desktop",
    description: "Anthropic's desktop app",
    supported: false,
    getRulePath: (_root) => "",
    strategy: "create-file",
    getTemplate: (_root) => "",
  },
];

export function writeRuleFile(
  target: RuleTarget,
  projectRoot: string,
  options: { dryRun?: boolean; force?: boolean },
): RuleWriteResult {
  const filePath = target.getRulePath(projectRoot);
  const templateContent = target.getTemplate(projectRoot);

  if (target.strategy === "append-section") {
    let finalContent: string;
    const existing = readTextFileIfExists(filePath);

    if (existing !== null) {
      const startIdx = existing.indexOf(MARKER_START);
      const endIdx = existing.indexOf(MARKER_END);

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        // Replace between markers (inclusive)
        finalContent =
          existing.slice(0, startIdx) +
          templateContent +
          existing.slice(endIdx + MARKER_END.length);
      } else {
        // Append to end
        const trimmed = existing.trimEnd();
        finalContent = trimmed ? trimmed + "\n\n" + templateContent + "\n" : templateContent + "\n";
      }

      if (!options.dryRun) {
        writeTextFileAtomically(filePath, finalContent);
      }
    } else {
      finalContent = templateContent + "\n";
      if (!options.dryRun) {
        writeTextFileAtomically(filePath, finalContent);
      }
    }

    return { target: target.label, status: "ok", filePath };
  }

  // create-file strategy
  if (options.dryRun) {
    if (!options.force && readTextFileIfExists(filePath) !== null) {
      return {
        target: target.label,
        status: "skipped",
        filePath,
        note: "File already exists. Use --force to overwrite.",
      };
    }

    return { target: target.label, status: "ok", filePath };
  }

  if (!options.dryRun) {
    if (options.force) {
      writeTextFileAtomically(filePath, templateContent);
    } else if (!writeTextFileExclusively(filePath, templateContent)) {
      return {
        target: target.label,
        status: "skipped",
        filePath,
        note: "File already exists. Use --force to overwrite.",
      };
    }
  }

  return { target: target.label, status: "ok", filePath };
}

export async function interactiveRulesSetup(
  projectRoot: string,
  preselectedMcpTargets?: string[],
): Promise<RuleWriteResult[]> {
  const shouldAdd = await p.confirm({
    message: "Add knowledgine rules to your AI tools?",
  });

  if (p.isCancel(shouldAdd) || !shouldAdd) {
    return [];
  }

  const preselected = new Set(preselectedMcpTargets ?? []);

  const selected = await p.multiselect({
    message: "Which AI tools should have knowledgine rules? (space to select, enter to confirm)",
    options: RULE_TARGETS.map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.supported ? t.description : `${t.description} (MCP only - no rule file support)`,
      // Note: @clack/prompts multiselect doesn't support disabled items,
      // so unsupported targets are shown with a hint but remain selectable.
      // We filter them out after selection.
    })),
    initialValues: RULE_TARGETS.filter((t) => t.supported && preselected.has(t.value)).map(
      (t) => t.value,
    ),
  });

  if (p.isCancel(selected)) {
    return [];
  }

  const selectedValues = selected as string[];
  const results: RuleWriteResult[] = [];
  const writtenSharedFiles = new Set<string>();
  const s = p.spinner();

  for (const value of selectedValues) {
    const ruleTarget = RULE_TARGETS.find((t) => t.value === value);
    if (!ruleTarget) continue;

    if (!ruleTarget.supported) {
      results.push({
        target: ruleTarget?.label ?? value,
        status: "skipped",
        filePath: "",
        note: "MCP only - no rule file support",
      });
      continue;
    }

    // Dedup shared files
    if (ruleTarget.sharedFile) {
      if (writtenSharedFiles.has(ruleTarget.sharedFile)) {
        results.push({
          target: ruleTarget?.label ?? value,
          status: "skipped",
          filePath: ruleTarget.getRulePath(projectRoot),
          note: `Shared file already written for ${ruleTarget.sharedFile}`,
        });
        continue;
      }
      writtenSharedFiles.add(ruleTarget.sharedFile);
    }

    s.start(`Writing rules for ${ruleTarget.label}...`);

    try {
      const result = writeRuleFile(ruleTarget, projectRoot, {});
      if (result.status === "ok") {
        s.stop(`${symbols.success} ${colors.success(ruleTarget.label)} rules written`);
      } else {
        s.stop(
          `${symbols.arrow} ${colors.dim(ruleTarget.label)} skipped${result.note ? ` — ${result.note}` : ""}`,
        );
      }
      results.push(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      s.stop(`${symbols.error} ${colors.error(ruleTarget.label)} failed`);
      results.push({
        target: ruleTarget?.label ?? value,
        status: "fail",
        filePath: ruleTarget.getRulePath(projectRoot),
        error: msg,
      });
    }
  }

  return results;
}

export function nonInteractiveRulesSetup(
  target: string,
  projectRoot: string,
  options: { write?: boolean },
): void {
  const ruleTarget = RULE_TARGETS.find((t) => t.value === target);

  if (!ruleTarget) {
    console.error(
      `${symbols.error} Unknown target: ${target}. Supported: ${RULE_TARGETS.filter(
        (t) => t.supported,
      )
        .map((t) => t.value)
        .join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  if (!ruleTarget.supported) {
    console.error(`${symbols.error} ${ruleTarget.label} does not support rule files (MCP only).`);
    process.exitCode = 1;
    return;
  }

  const templateContent = ruleTarget.getTemplate(projectRoot);
  const filePath = ruleTarget.getRulePath(projectRoot);

  if (!options.write) {
    console.error(`\nRule file preview for ${ruleTarget.label}:`);
    console.error(colors.dim(`Path: ${filePath}`));
    console.error("");
    console.error(templateContent);
    console.error("");
    console.error(
      `${symbols.arrow} ${colors.dim(`To write: kg setup rules --target ${target} --write`)}`,
    );
    return;
  }

  try {
    const result = writeRuleFile(ruleTarget, projectRoot, {});
    if (result.status === "ok") {
      console.error(`${symbols.success} ${colors.success(`Rules written: ${filePath}`)}`);
    } else if (result.status === "skipped") {
      console.error(
        `${symbols.arrow} ${colors.dim(`Skipped: ${filePath}`)}${result.note ? ` — ${result.note}` : ""}`,
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${symbols.error} Failed to write rules: ${msg}`);
    process.exitCode = 1;
  }
}
