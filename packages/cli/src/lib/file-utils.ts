import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";

function hasErrnoCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

export function readTextFileIfExists(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf-8");
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

export function backupFileIfExists(filePath: string): void {
  try {
    copyFileSync(filePath, `${filePath}.bak`);
  } catch (error) {
    if (!hasErrnoCode(error, "ENOENT")) {
      throw error;
    }
  }
}

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
    backupFileIfExists(filePath);
    renameSync(tempPath, filePath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function writeTextFileExclusively(filePath: string, content: string): boolean {
  mkdirSync(dirname(filePath), { recursive: true });

  try {
    writeFileSync(filePath, content, {
      encoding: "utf-8",
      flag: "wx",
      mode: 0o600,
    });
    return true;
  } catch (error) {
    if (hasErrnoCode(error, "EEXIST")) {
      return false;
    }
    throw error;
  }
}
