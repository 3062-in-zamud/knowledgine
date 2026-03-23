import { resolve } from "path";
import { existsSync } from "fs";
import { cleanDemo, getDemoDir } from "../lib/demo-manager.js";
import { createBox, colors, symbols } from "../lib/ui/index.js";

export interface DemoOptions {
  clean?: boolean;
}

const DEMO_NOTES_DIR = "knowledgine-demo-notes";

export function getDemoNotesPath(basePath?: string): string {
  return resolve(basePath ?? process.cwd(), DEMO_NOTES_DIR);
}

export async function demoCommand(options: DemoOptions): Promise<void> {
  if (options.clean) {
    const demoPath = getDemoNotesPath();
    if (!existsSync(demoPath)) {
      console.error("No demo files found to clean.");
      return;
    }
    cleanDemo(demoPath);
    console.error(`${symbols.success} Demo files cleaned successfully.`);
    return;
  }

  // Show demo usage information
  const demoDir = getDemoDir();
  const hasDemoFixtures = existsSync(demoDir);

  if (!hasDemoFixtures) {
    console.error(`${symbols.error} Error: Demo fixtures not found. Reinstall the package.`);
    return;
  }

  const usageLines = [
    colors.bold("knowledgine demo mode"),
    "",
    "Try knowledgine with sample developer notes:",
    "",
    `  1. ${colors.accent("knowledgine init --demo")}        Set up demo environment`,
    `  2. ${colors.accent('knowledgine search "auth" --demo')}  Search demo notes`,
    `  3. ${colors.accent("knowledgine demo --clean")}        Remove demo files`,
    "",
    "The demo includes 8 sample notes covering:",
    `  ${symbols.bullet} Authentication debugging (JWT)`,
    `  ${symbols.bullet} React performance optimization`,
    `  ${symbols.bullet} Docker networking troubleshooting`,
    `  ${symbols.bullet} REST API design decisions`,
    `  ${symbols.bullet} TypeScript migration learnings`,
    `  ${symbols.bullet} Database query optimization`,
    `  ${symbols.bullet} CI/CD pipeline setup`,
    `  ${symbols.bullet} Code review guidelines`,
  ];

  console.error(createBox(usageLines.join("\n")));
}
