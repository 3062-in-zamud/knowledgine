import os from "node:os";
import { isAbsolute, join } from "node:path";
import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";

const EXTENSION_ID = "saoudrizwan.claude-dev";

/**
 * Resolve the directory that holds Cline's per-extension globalStorage.
 *
 * Order:
 *   1. `CLINE_STORAGE_PATH` env var (must be an absolute path; symlinks
 *      are resolved). Empty string is ignored.
 *   2. OS-specific VS Code default location.
 *
 * @throws if `CLINE_STORAGE_PATH` is set to a relative path.
 */
export function getClineStorageDir(): string {
  const override = process.env["CLINE_STORAGE_PATH"];
  if (override && override.length > 0) {
    if (!isAbsolute(override)) {
      throw new Error(`CLINE_STORAGE_PATH must be an absolute path (got: ${override})`);
    }
    try {
      return realpathSync(override);
    } catch {
      // Path does not exist yet — return the un-resolved absolute path so
      // callers can graceful-skip on readdir.
      return override;
    }
  }

  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return join(
        home,
        "Library",
        "Application Support",
        "Code",
        "User",
        "globalStorage",
        EXTENSION_ID,
      );
    case "linux":
      return join(home, ".config", "Code", "User", "globalStorage", EXTENSION_ID);
    case "win32": {
      const appData = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
      return join(appData, "Code", "User", "globalStorage", EXTENSION_ID);
    }
    default:
      return join(home, ".config", "Code", "User", "globalStorage", EXTENSION_ID);
  }
}

/**
 * Compute a short, deterministic hash of the storage path for inclusion in
 * the source URI. Prevents `cline-session://<taskId>` collisions across
 * multiple VS Code installs (Stable / Insiders / Cursor / Windsurf) that
 * could share a task-id namespace.
 */
export function computeStorageHash(storageDir: string): string {
  return createHash("sha256").update(storageDir).digest("hex").slice(0, 8);
}
