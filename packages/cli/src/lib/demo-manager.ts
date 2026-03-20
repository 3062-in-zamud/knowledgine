import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { cpSync, rmSync, existsSync, mkdirSync, readdirSync } from "fs";

/**
 * Resolve the path to the bundled demo fixture notes.
 * Works from both src/ (development) and dist/ (published package).
 */
export function getDemoDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // In dist: dist/lib/demo-manager.js -> package root
  // In src:  src/lib/demo-manager.js  -> package root
  const packageRoot = resolve(currentDir, "..", "..");
  return resolve(packageRoot, "fixtures", "demo", "notes");
}

/**
 * Copy demo fixtures into the target directory.
 * Returns the number of markdown files copied.
 */
export function copyDemoFixtures(targetDir: string): number {
  const demoDir = getDemoDir();
  if (!existsSync(demoDir)) {
    throw new Error(`Demo fixtures not found at ${demoDir}`);
  }
  mkdirSync(targetDir, { recursive: true });
  cpSync(demoDir, targetDir, { recursive: true });
  return readdirSync(targetDir).filter((f) => f.endsWith(".md")).length;
}

/**
 * Remove the demo notes directory.
 * Only removes the notes directory — does NOT touch .knowledgine.
 */
export function cleanDemo(demoPath: string): void {
  if (existsSync(demoPath)) {
    rmSync(demoPath, { recursive: true });
  }
}
