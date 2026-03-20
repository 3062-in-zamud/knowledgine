import { resolve } from "path";
import { existsSync } from "fs";
import { cleanDemo, getDemoDir } from "../lib/demo-manager.js";

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
    console.error("Demo files cleaned successfully.");
    return;
  }

  // Show demo usage information
  const demoDir = getDemoDir();
  const hasDemoFixtures = existsSync(demoDir);

  console.error("knowledgine demo mode");
  console.error("");
  if (!hasDemoFixtures) {
    console.error("Error: Demo fixtures not found. Reinstall the package.");
    return;
  }
  console.error("Try knowledgine with sample developer notes:");
  console.error("");
  console.error("  1. knowledgine init --demo        Set up demo environment");
  console.error('  2. knowledgine search "auth" --demo  Search demo notes');
  console.error("  3. knowledgine demo --clean        Remove demo files");
  console.error("");
  console.error("The demo includes 8 sample notes covering:");
  console.error("  - Authentication debugging (JWT)");
  console.error("  - React performance optimization");
  console.error("  - Docker networking troubleshooting");
  console.error("  - REST API design decisions");
  console.error("  - TypeScript migration learnings");
  console.error("  - Database query optimization");
  console.error("  - CI/CD pipeline setup");
  console.error("  - Code review guidelines");
}
