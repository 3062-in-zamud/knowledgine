/**
 * Normalize entity name for deduplication.
 * Preserves slash as org/repo separator, normalizes separators within segments.
 */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .split("/")
    .map((segment) => segment.replace(/[_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))
    .filter((s) => s.length > 0)
    .join("/");
}
