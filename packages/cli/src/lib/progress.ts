/**
 * Progress display utility for CLI operations.
 * TTY: in-place updates with \r
 * Non-TTY: milestone-only output
 * All output goes to stderr to avoid MCP stdout conflicts.
 */

export interface Progress {
  update(current: number, detail?: string): void;
  finish(): void;
}

/**
 * Step-based progress interface for structured multi-step operations.
 * Tracks named steps with status indicators.
 */
export interface StepProgress {
  /** Mark the named step as started (pending state). */
  startStep(name: string): void;
  /** Mark the named step as successfully completed. */
  completeStep(name: string): void;
  /** Mark the named step as failed with an optional reason. */
  failStep(name: string, reason?: string): void;
  /** Mark the named step as skipped with an optional reason. */
  skipStep(name: string, reason?: string): void;
  /** Print a warning message associated with the current step. */
  warn(message: string): void;
  /** Finalize and print the overall summary. */
  finish(): void;
}

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface Step {
  name: string;
  status: StepStatus;
  reason?: string;
}

export interface SummaryEntry {
  label: string;
  value: string | number;
}

export function createSummaryReport(title: string, entries: SummaryEntry[]): string {
  const maxLabelLen = entries.length > 0 ? Math.max(...entries.map((e) => e.label.length)) : 0;
  const header = `── ${title} ${"─".repeat(Math.max(0, 36 - title.length - 4))}`;
  const footer = "─".repeat(header.length);
  const lines = entries.map((e) => `  ${e.label.padEnd(maxLabelLen)}  ${e.value}`);
  return [header, ...lines, footer].join("\n");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function useColor(): boolean {
  return !process.env["NO_COLOR"];
}

function stepIcon(status: StepStatus): string {
  if (!useColor()) {
    switch (status) {
      case "done":
        return "[ok]";
      case "failed":
        return "[fail]";
      case "skipped":
        return "[skip]";
      case "running":
        return "[..]";
      default:
        return "[ ]";
    }
  }
  switch (status) {
    case "done":
      return "\u2714"; // ✔
    case "failed":
      return "\u2718"; // ✘
    case "skipped":
      return "\u2212"; // −
    case "running":
      return "\u25ba"; // ►
    default:
      return " ";
  }
}

export function createProgress(total: number, label: string): Progress {
  const isTTY = process.stderr.isTTY ?? false;
  const startTime = Date.now();
  let lastMilestone = -1;

  function write(text: string): void {
    process.stderr.write(text);
  }

  function update(current: number, detail?: string): void {
    if (isTTY) {
      const detailStr = detail ? ` ${detail}` : "";
      const line = useColor()
        ? `\r[${current}/${total}] ${label}...${detailStr}`
        : `\r[${current}/${total}] ${label}...${detailStr}`;
      write(line);
    } else {
      // Non-TTY: output at 0%, 25%, 50%, 75%, 100% milestones
      const pct = total > 0 ? Math.floor((current / total) * 4) : 0;
      if (pct > lastMilestone) {
        lastMilestone = pct;
        write(`[${current}/${total}] ${label}...\n`);
      }
    }
  }

  function finish(): void {
    const elapsed = formatDuration(Date.now() - startTime);
    if (isTTY) {
      write(`\r[${total}/${total}] ${label} (${elapsed})\n`);
    } else {
      write(`${label}: ${total} done (${elapsed})\n`);
    }
  }

  return { update, finish };
}

/**
 * Create a step-based progress tracker for structured multi-step CLI operations.
 *
 * Each step is printed as it starts/completes to give real-time feedback.
 * Designed to be used with init, upgrade, and other multi-phase commands.
 *
 * @param totalSteps - Expected number of steps (used for summary only)
 * @param title - Optional title printed before the first step
 *
 * @example
 * ```ts
 * const steps = createStepProgress(4, "Initializing knowledgine");
 * steps.startStep("Creating directory");
 * steps.completeStep("Creating directory");
 * steps.startStep("Reading configuration");
 * steps.failStep("Reading configuration", "Permission denied");
 * steps.finish();
 * ```
 */
export function createStepProgress(totalSteps: number, title?: string): StepProgress {
  const steps: Step[] = [];
  const startTime = Date.now();
  let warnCount = 0;

  function write(text: string): void {
    process.stderr.write(text);
  }

  function findStep(name: string): Step | undefined {
    return steps.find((s) => s.name === name);
  }

  function printStepLine(step: Step): void {
    const icon = stepIcon(step.status);
    const reasonStr = step.reason ? ` (${step.reason})` : "";
    write(`  ${icon} ${step.name}${reasonStr}\n`);
  }

  if (title) {
    write(`\n${title}\n`);
  }

  function startStep(name: string): void {
    let step = findStep(name);
    if (!step) {
      step = { name, status: "running" };
      steps.push(step);
    } else {
      step.status = "running";
      step.reason = undefined;
    }
    // Print running indicator so the user sees activity
    const icon = stepIcon("running");
    write(`  ${icon} ${name}...\n`);
  }

  function completeStep(name: string): void {
    let step = findStep(name);
    if (!step) {
      step = { name, status: "done" };
      steps.push(step);
    } else {
      step.status = "done";
      step.reason = undefined;
    }
    printStepLine(step);
  }

  function failStep(name: string, reason?: string): void {
    let step = findStep(name);
    if (!step) {
      step = { name, status: "failed", reason };
      steps.push(step);
    } else {
      step.status = "failed";
      step.reason = reason;
    }
    printStepLine(step);
  }

  function skipStep(name: string, reason?: string): void {
    let step = findStep(name);
    if (!step) {
      step = { name, status: "skipped", reason };
      steps.push(step);
    } else {
      step.status = "skipped";
      step.reason = reason;
    }
    printStepLine(step);
  }

  function warn(message: string): void {
    warnCount++;
    write(`  ! ${message}\n`);
  }

  function finish(): void {
    const elapsed = formatDuration(Date.now() - startTime);
    const doneCount = steps.filter((s) => s.status === "done").length;
    const failCount = steps.filter((s) => s.status === "failed").length;
    const skipCount = steps.filter((s) => s.status === "skipped").length;

    write(`\n`);
    if (failCount > 0) {
      write(
        `Completed with errors (${elapsed}): ${doneCount}/${totalSteps} steps, ${failCount} failed, ${skipCount} skipped\n`,
      );
    } else if (warnCount > 0 || skipCount > 0) {
      write(
        `Completed with warnings (${elapsed}): ${doneCount}/${totalSteps} steps, ${skipCount} skipped\n`,
      );
    } else {
      write(`All steps completed (${elapsed})\n`);
    }
  }

  return { startStep, completeStep, failStep, skipStep, warn, finish };
}
