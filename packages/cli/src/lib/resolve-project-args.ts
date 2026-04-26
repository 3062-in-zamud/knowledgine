import { existsSync } from "fs";
import { homedir } from "os";
import { isAbsolute, basename, resolve as resolvePath, join } from "path";
import type { ProjectEntry } from "@knowledgine/core";

export const MAX_CONNECTIONS = 10;

export interface ResolveResult {
  resolved: ProjectEntry[];
  unresolvedNames: string[];
  unresolvedPaths: string[];
  truncatedCount: number;
}

interface ResolveOptions {
  cwd?: string;
  homeDir?: string;
}

function isPathLike(arg: string): boolean {
  if (isAbsolute(arg)) return true;
  return /^(\.\.?|~)(\/|\\|$)/.test(arg);
}

function expandAndResolvePath(arg: string, cwd: string, homeDir: string): string {
  let expanded = arg;
  if (arg === "~") {
    expanded = homeDir;
  } else if (arg.startsWith("~/") || arg.startsWith("~\\")) {
    expanded = join(homeDir, arg.slice(2));
  }
  return resolvePath(cwd, expanded);
}

export function resolveProjectArgs(
  rawArg: string,
  rcProjects: ReadonlyArray<ProjectEntry>,
  options: ResolveOptions = {},
): ResolveResult {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();

  const entries = rawArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const resolved: ProjectEntry[] = [];
  const unresolvedNames: string[] = [];
  const unresolvedPaths: string[] = [];
  const seenPaths = new Set<string>();

  // Pre-index rc entries by their normalized absolute paths so that path-
  // based inputs can recover visibility/allowFrom from the registry. Without
  // this, a private project addressed by `--from /abs/path` would silently
  // become public-by-default and bypass the visibility gate.
  const rcByPath = new Map<string, ProjectEntry>();
  for (const p of rcProjects) {
    try {
      rcByPath.set(resolvePath(cwd, p.path), p);
    } catch {
      // ignore non-resolvable rc entries; they cannot be matched anyway
    }
  }

  for (const entry of entries) {
    if (isPathLike(entry)) {
      let absPath: string;
      try {
        absPath = expandAndResolvePath(entry, cwd, homeDir);
      } catch {
        unresolvedPaths.push(entry);
        continue;
      }

      const dbPath = join(absPath, ".knowledgine", "index.sqlite");
      if (!existsSync(dbPath)) {
        unresolvedPaths.push(entry);
        continue;
      }

      if (seenPaths.has(absPath)) continue;
      seenPaths.add(absPath);

      // Inherit name + visibility metadata from the rc entry if the path
      // matches an entry by absolute path. Otherwise fall back to basename.
      const rcMatch = rcByPath.get(absPath);
      if (rcMatch) {
        resolved.push({
          name: rcMatch.name,
          path: absPath,
          visibility: rcMatch.visibility,
          allowFrom: rcMatch.allowFrom,
        });
      } else {
        const name = basename(absPath) || absPath;
        resolved.push({ name, path: absPath });
      }
    } else {
      const match = rcProjects.find((p) => p.name === entry);
      if (match) {
        const normalized = resolvePath(cwd, match.path);
        if (seenPaths.has(normalized)) continue;
        seenPaths.add(normalized);
        resolved.push({
          name: match.name,
          path: match.path,
          visibility: match.visibility,
          allowFrom: match.allowFrom,
        });
      } else {
        unresolvedNames.push(entry);
      }
    }
  }

  let truncatedCount = 0;
  let truncated = resolved;
  if (resolved.length > MAX_CONNECTIONS) {
    truncatedCount = resolved.length - MAX_CONNECTIONS;
    truncated = resolved.slice(0, MAX_CONNECTIONS);
  }

  return {
    resolved: truncated,
    unresolvedNames,
    unresolvedPaths,
    truncatedCount,
  };
}
