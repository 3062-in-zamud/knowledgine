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
