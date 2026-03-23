import Table from "cli-table3";
import { colors } from "./theme.js";

export interface TableConfig {
  head: string[];
  rows: (string | number)[][];
  colWidths?: number[];
  compact?: boolean;
}

export function createTable(config: TableConfig): string;
export function createTable(head: string[], rows: (string | number)[][]): string;
export function createTable(
  configOrHead: TableConfig | string[],
  rows?: (string | number)[][],
): string {
  let config: TableConfig;
  if (Array.isArray(configOrHead)) {
    config = { head: configOrHead, rows: rows ?? [] };
  } else {
    config = configOrHead;
  }

  const tableOptions: ConstructorParameters<typeof Table>[0] = {
    head: config.head.map((h) => colors.bold(h)),
    style: {
      head: [],
      border: ["gray"],
      compact: config.compact ?? false,
    },
  };
  if (config.colWidths !== undefined) {
    tableOptions.colWidths = config.colWidths;
  }
  const table = new Table(tableOptions);
  for (const row of config.rows) {
    table.push(row.map(String));
  }
  return table.toString();
}
