import { join } from "path";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import * as p from "@clack/prompts";
import { colors, symbols } from "../lib/ui/index.js";
import { SKILL_NAMES, getSkillTemplate, type SkillName } from "../templates/skills/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillSetupTarget {
  /** Matches TARGETS[].value in setup.ts */
  value: string;
  label: string;
  description: string;
  /** false = shown disabled in multiselect */
  supported: boolean;
  /** Returns the skill directory path for this agent given the project root */
  getSkillDir: (root: string) => string;
  /** Identifier for shared-dir dedup (agents sharing the same physical dir) */
  sharedDir?: string;
}

export interface SkillWriteResult {
  target: string;
  status: "ok" | "skipped" | "fail";
  skillDir: string;
  skillCount: number;
  error?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

// Sentinel used for unsupported targets — getSkillDir should never be called
// on them, but TypeScript requires the field to be present.
const unsupportedSkillDir = (_root: string): string => {
  throw new Error("This target does not support skills.");
};

export const SKILL_TARGETS: SkillSetupTarget[] = [
  {
    value: "claude-code",
    label: "Claude Code",
    description: "CLI agent for developers",
    supported: true,
    getSkillDir: (root) => join(root, ".claude", "skills"),
  },
  {
    value: "codex",
    label: "Codex CLI",
    description: "OpenAI's coding agent",
    supported: true,
    getSkillDir: (root) => join(root, "skills"),
  },
  {
    value: "cursor",
    label: "Cursor",
    description: "AI-first code editor",
    supported: true,
    getSkillDir: (root) => join(root, ".cursor", "skills"),
  },
  {
    value: "windsurf",
    label: "Windsurf",
    description: "Codeium's AI IDE",
    supported: true,
    getSkillDir: (root) => join(root, ".windsurf", "skills"),
  },
  {
    value: "cline",
    label: "Cline",
    description: "Cline VS Code extension",
    supported: true,
    getSkillDir: (root) => join(root, ".cline", "skills"),
  },
  {
    value: "github-copilot",
    label: "GitHub Copilot CLI",
    description: "AI pair programmer CLI",
    supported: true,
    getSkillDir: (root) => join(root, ".copilot", "skills"),
    sharedDir: "copilot-skills",
  },
  {
    value: "vscode",
    label: "VS Code",
    description: "GitHub Copilot MCP",
    supported: true,
    getSkillDir: (root) => join(root, ".copilot", "skills"),
    sharedDir: "copilot-skills",
  },
  {
    value: "gemini",
    label: "Gemini CLI",
    description: "Google's AI coding agent",
    supported: true,
    getSkillDir: (root) => join(root, ".gemini", "skills"),
    sharedDir: "gemini-skills",
  },
  {
    value: "opencode",
    label: "OpenCode",
    description: "opencode.ai MCP configuration",
    supported: true,
    getSkillDir: (root) => join(root, ".opencode", "skills"),
  },
  {
    value: "antigravity",
    label: "Antigravity",
    description: "Google's AI development platform",
    supported: true,
    getSkillDir: (root) => join(root, ".gemini", "skills"),
    sharedDir: "gemini-skills",
  },
  {
    value: "continue",
    label: "Continue",
    description: "Continue.dev MCP configuration",
    supported: false,
    getSkillDir: unsupportedSkillDir,
  },
  {
    value: "zed",
    label: "Zed",
    description: "High-performance editor",
    supported: false,
    getSkillDir: unsupportedSkillDir,
  },
  {
    value: "claude-desktop",
    label: "Claude Desktop",
    description: "Anthropic's desktop app",
    supported: false,
    getSkillDir: unsupportedSkillDir,
  },
];

// ---------------------------------------------------------------------------
// writeSkills
// ---------------------------------------------------------------------------

/**
 * Writes skill files (SKILL.md + references/) for a single target agent.
 *
 * When `dryRun` is true, the function computes what would be written and
 * returns the result without touching the filesystem.
 *
 * When `force` is false (default) and the skill directory already exists,
 * the write is skipped.
 */
export function writeSkills(
  target: SkillSetupTarget,
  projectRoot: string,
  skillNames: SkillName[],
  options: { dryRun?: boolean; force?: boolean },
): SkillWriteResult {
  const { dryRun = false, force = false } = options;
  const skillDir = target.getSkillDir(projectRoot);

  // Guard: skip if the skill dir exists and force is not set
  if (!force && existsSync(skillDir)) {
    return {
      target: target.label,
      status: "skipped",
      skillDir,
      skillCount: 0,
      note: "skill directory already exists; use --force to overwrite",
    };
  }

  if (dryRun) {
    return {
      target: target.label,
      status: "ok",
      skillDir,
      skillCount: skillNames.length,
      note: "dry-run: no files written",
    };
  }

  try {
    let writtenCount = 0;

    for (const name of skillNames) {
      const template = getSkillTemplate(name);
      const skillNameDir = join(skillDir, name);
      const refsDir = join(skillNameDir, "references");

      mkdirSync(skillNameDir, { recursive: true });
      writeFileSync(join(skillNameDir, "SKILL.md"), template.skillMd, "utf-8");

      mkdirSync(refsDir, { recursive: true });
      for (const [filename, content] of Object.entries(template.references)) {
        writeFileSync(join(refsDir, filename), content, "utf-8");
      }

      writtenCount++;
    }

    return {
      target: target.label,
      status: "ok",
      skillDir,
      skillCount: writtenCount,
    };
  } catch (error) {
    return {
      target: target.label,
      status: "fail",
      skillDir,
      skillCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// interactiveSkillsSetup
// ---------------------------------------------------------------------------

/**
 * Interactive wizard for the "Skills" step of `kg setup`.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param preselectedMcpTargets - Agent values already chosen in the MCP step,
 *   used to pre-populate the multiselect.
 */
export async function interactiveSkillsSetup(
  projectRoot: string,
  preselectedMcpTargets?: string[],
): Promise<SkillWriteResult[]> {
  // Step 1: ask whether to install skills at all
  const shouldInstall = await p.confirm({
    message: "Install knowledgine skills to your AI tools?",
  });

  if (p.isCancel(shouldInstall) || !shouldInstall) {
    return [];
  }

  // Step 2: select target agents
  const supportedTargets = SKILL_TARGETS.filter((t) => t.supported);
  const preselected = new Set(preselectedMcpTargets ?? []);

  const selectedTargetsRaw = await p.multiselect({
    message: "Which AI tools should receive the skills? (space to select, enter to confirm)",
    options: SKILL_TARGETS.map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.supported ? t.description : `${t.description} (not supported yet)`,
    })).filter((opt) => supportedTargets.some((st) => st.value === opt.value)),
    initialValues: supportedTargets.filter((t) => preselected.has(t.value)).map((t) => t.value),
    required: true,
  });

  if (p.isCancel(selectedTargetsRaw)) {
    p.cancel("Skills setup cancelled.");
    return [];
  }

  const selectedTargetValues = selectedTargetsRaw as string[];

  // Step 3: choose skill set (all or individual selection)
  const installMode = await p.select({
    message: "Which skills to install?",
    options: [
      {
        value: "all",
        label: "All (recommended)",
        hint: `${SKILL_NAMES.length} skills`,
      },
      {
        value: "select",
        label: "Select individually...",
      },
    ],
  });

  if (p.isCancel(installMode)) {
    p.cancel("Skills setup cancelled.");
    return [];
  }

  let skillsToInstall: SkillName[];

  if (installMode === "select") {
    const selectedSkillsRaw = await p.multiselect({
      message: "Which skills to install? (space to select, enter to confirm)",
      options: SKILL_NAMES.map((name) => ({ value: name, label: name })),
      required: true,
    });

    if (p.isCancel(selectedSkillsRaw)) {
      p.cancel("Skills setup cancelled.");
      return [];
    }

    skillsToInstall = selectedSkillsRaw as SkillName[];
  } else {
    skillsToInstall = [...SKILL_NAMES];
  }

  // Step 4: write skills, deduplicating shared directories
  const results: SkillWriteResult[] = [];
  const writtenSharedDirs = new Set<string>();

  for (const targetValue of selectedTargetValues) {
    const target = SKILL_TARGETS.find((t) => t.value === targetValue);
    if (!target) continue;

    // Dedup: agents sharing the same physical directory (e.g. github-copilot + vscode)
    if (target.sharedDir) {
      if (writtenSharedDirs.has(target.sharedDir)) {
        results.push({
          target: target.label,
          status: "skipped",
          skillDir: target.getSkillDir(projectRoot),
          skillCount: 0,
          note: `shared with ${target.sharedDir} (already written)`,
        });
        continue;
      }
      writtenSharedDirs.add(target.sharedDir);
    }

    const s = p.spinner();
    s.start(`Installing skills for ${target.label}...`);

    const result = writeSkills(target, projectRoot, skillsToInstall, { force: false });

    if (result.status === "ok") {
      s.stop(
        `${symbols.success} ${colors.success(target.label)} — ${result.skillCount} skill(s) installed`,
      );
    } else if (result.status === "skipped") {
      s.stop(`${symbols.warning} ${colors.warning(target.label)} — skipped: ${result.note}`);
    } else {
      s.stop(`${symbols.error} ${colors.error(target.label)} — failed: ${result.error}`);
    }

    results.push(result);
  }

  // Summary note
  const ok = results.filter((r) => r.status === "ok");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "fail");

  const summaryLines: string[] = [];
  for (const r of ok) {
    summaryLines.push(
      `${symbols.success} ${r.target}  ${colors.dim(r.skillDir)}  (${r.skillCount} skills)`,
    );
  }
  for (const r of skipped) {
    summaryLines.push(`${symbols.warning} ${r.target}  ${colors.dim(r.note ?? "skipped")}`);
  }
  for (const r of failed) {
    summaryLines.push(`${symbols.error} ${r.target}  ${colors.dim(r.error ?? "unknown error")}`);
  }

  if (summaryLines.length > 0) {
    const title =
      failed.length > 0
        ? `Skills: ${ok.length} installed, ${skipped.length} skipped, ${failed.length} failed`
        : `Skills installed (${ok.length} agents)`;
    p.note(summaryLines.join("\n"), title);
  }

  return results;
}

// ---------------------------------------------------------------------------
// nonInteractiveSkillsSetup
// ---------------------------------------------------------------------------

/**
 * Non-interactive (scripted) variant used when `--target` is specified on the
 * command line.
 *
 * @param target - Agent value string (e.g. "claude-code").
 * @param projectRoot - Absolute path to the project root.
 * @param options.write - When false (default) only prints a preview.
 */
export function nonInteractiveSkillsSetup(
  target: string,
  projectRoot: string,
  options: { write?: boolean },
): void {
  const skillTarget = SKILL_TARGETS.find((t) => t.value === target);

  if (!skillTarget) {
    console.error(
      `${symbols.error} Unknown target: ${target}. Supported: ${SKILL_TARGETS.filter(
        (t) => t.supported,
      )
        .map((t) => t.value)
        .join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  if (!skillTarget.supported) {
    console.error(`${symbols.error} Skills are not yet supported for ${skillTarget.label}.`);
    process.exitCode = 1;
    return;
  }

  const skillDir = skillTarget.getSkillDir(projectRoot);

  if (!options.write) {
    // Preview mode: list what would be written
    console.error(`\n${colors.bold("Skills preview")} for ${colors.accent(skillTarget.label)}\n`);
    console.error(`${colors.hint("Skill directory:")} ${skillDir}\n`);
    for (const name of SKILL_NAMES) {
      const template = getSkillTemplate(name);
      const refCount = Object.keys(template.references).length;
      console.error(
        `  ${symbols.bullet} ${name}  ${colors.dim(`(SKILL.md + ${refCount} reference file(s))`)}`,
      );
    }
    console.error("");
    console.error(
      `${symbols.arrow} ${colors.hint(`To write: kg setup skills --target ${target} --write`)}`,
    );
    return;
  }

  // Write mode
  const result = writeSkills(skillTarget, projectRoot, [...SKILL_NAMES], { force: false });

  if (result.status === "ok") {
    console.error(
      `${symbols.success} ${colors.success(`Skills written to ${result.skillDir}`)} (${result.skillCount} skills)`,
    );
  } else if (result.status === "skipped") {
    console.error(`${symbols.warning} ${colors.warning("Skipped:")} ${result.note}`);
  } else {
    console.error(`${symbols.error} ${colors.error("Failed:")} ${result.error}`);
    process.exitCode = 1;
  }
}
