import chalk from "chalk";
import logSymbols from "log-symbols";

export const colors = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
  hint: chalk.gray,
  accent: chalk.magenta,
  bold: chalk.bold,
  dim: chalk.dim,
  label: chalk.bold.white,
} as const;

export const symbols = {
  success: logSymbols.success,
  error: logSymbols.error,
  warning: logSymbols.warning,
  info: logSymbols.info,
  arrow: "→",
  bullet: "●",
} as const;

export function scoreColor(score: number): (text: string) => string {
  if (score >= 0.7) return chalk.green;
  if (score >= 0.4) return chalk.yellow;
  return chalk.red;
}
