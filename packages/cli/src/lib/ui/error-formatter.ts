import { colors, symbols } from "./theme.js";
import { createBox } from "./box.js";

export interface StructuredError {
  message: string;
  cause?: string;
  solutions?: string[];
  hint?: string;
}

export function formatStructuredError(err: StructuredError): string {
  const lines: string[] = [`${symbols.error} ${colors.error(colors.bold(err.message))}`];
  if (err.cause) {
    lines.push("", `${colors.dim("Cause:")} ${err.cause}`);
  }
  if (err.solutions && err.solutions.length > 0) {
    lines.push("", colors.dim("Solutions:"));
    for (const s of err.solutions) {
      lines.push(`  ${symbols.arrow} ${s}`);
    }
  }
  if (err.hint) {
    lines.push("", colors.hint(err.hint));
  }
  return createBox(lines.join("\n"), { type: "error", title: "Error" });
}
