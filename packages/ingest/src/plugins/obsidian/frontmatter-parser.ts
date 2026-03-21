export interface ObsidianFrontmatter {
  tags: string[];
  aliases: string[];
  custom: Record<string, unknown>;
}

export function parseObsidianFrontmatter(
  raw: Record<string, unknown>,
): ObsidianFrontmatter {
  // tags正規化
  const rawTags = raw.tags;
  let tags: string[] = [];
  if (typeof rawTags === "string") {
    tags = rawTags
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);
  } else if (Array.isArray(rawTags)) {
    tags = rawTags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);
  }

  // aliases正規化
  const rawAliases = raw.aliases;
  let aliases: string[] = [];
  if (typeof rawAliases === "string") {
    aliases = [rawAliases.trim()].filter(Boolean);
  } else if (Array.isArray(rawAliases)) {
    aliases = rawAliases
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim())
      .filter(Boolean);
  }

  // custom fields (tags, aliases, title以外)
  const custom: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key !== "tags" && key !== "aliases" && key !== "title") {
      custom[key] = value;
    }
  }

  return { tags, aliases, custom };
}

export function extractInlineTags(content: string): string[] {
  // コードブロック除外
  const withoutCodeBlocks = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "");

  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_\-/]+)/g;
  const tags = new Set<string>();
  let match;

  while ((match = tagRegex.exec(withoutCodeBlocks)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}
