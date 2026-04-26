import type { ProjectEntry } from "../storage/project-db.js";

export const ALLOW_PRIVATE_ENV_VAR = "KNOWLEDGINE_ALLOW_PRIVATE";

export const PRIVATE_BYPASS_WARNING =
  "[KNOWLEDGINE_ALLOW_PRIVATE] private project access bypass active";

function isBypassActive(): boolean {
  return process.env[ALLOW_PRIVATE_ENV_VAR] === "1";
}

function emitBypassWarning(): void {
  process.stderr.write(`${PRIVATE_BYPASS_WARNING}\n`);
}

function isPublic(p: ProjectEntry): boolean {
  return p.visibility !== "private";
}

function isAllowed(callerSelfName: string | null, p: ProjectEntry): boolean {
  if (callerSelfName === null) return false;
  return Array.isArray(p.allowFrom) && p.allowFrom.includes(callerSelfName);
}

/**
 * Filter the supplied project list down to those a given caller is
 * allowed to read. Public projects are always included; private projects
 * are included only when the caller's `selfName` is in their `allowFrom`
 * list. Setting `KNOWLEDGINE_ALLOW_PRIVATE=1` lets every project through
 * regardless, but emits a stderr warning on every call so the bypass is
 * never silent.
 *
 * Project order from `projects` is preserved so callers can rely on
 * the .knowledginerc declaration order — and so the filter-then-slice
 * order with `MAX_CONNECTIONS` does not waste slots on hidden projects.
 */
export function filterReadableProjects(
  callerSelfName: string | null,
  projects: ProjectEntry[],
): ProjectEntry[] {
  const bypass = isBypassActive();
  if (bypass) emitBypassWarning();
  return projects.filter((p) => bypass || isPublic(p) || isAllowed(callerSelfName, p));
}

/**
 * Check whether a given caller may transfer/link from a single source
 * project. Mirrors `filterReadableProjects` for write paths.
 */
export function canTransferFrom(callerSelfName: string | null, source: ProjectEntry): boolean {
  if (isBypassActive()) {
    emitBypassWarning();
    return true;
  }
  return isPublic(source) || isAllowed(callerSelfName, source);
}
