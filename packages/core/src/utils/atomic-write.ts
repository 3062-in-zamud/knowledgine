import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";

export function writeTextFileAtomically(filePath: string, content: string): void {
  const parentDir = dirname(filePath);
  mkdirSync(parentDir, { recursive: true });

  const tempDir = mkdtempSync(join(parentDir, ".knowledgine-atomic-"));
  const tempPath = join(tempDir, basename(filePath));

  try {
    writeFileSync(tempPath, content, {
      encoding: "utf-8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(tempPath, filePath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
