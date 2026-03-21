import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";

export interface WikiLink {
  raw: string;
  target: string;
  alias?: string;
  heading?: string;
  isEmbed: boolean;
}

export function parseWikiLinks(content: string): WikiLink[] {
  // コードブロック内のwikilinkを除外
  const codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;
  const codeBlocks: Array<{ start: number; end: number }> = [];
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push({ start: match.index, end: match.index + match[0].length });
  }

  const wikiLinkRegex = /(!?)\[\[([^\]]+)\]\]/g;
  const links: WikiLink[] = [];

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const pos = match.index;
    if (codeBlocks.some((b) => pos >= b.start && pos < b.end)) continue;

    const isEmbed = match[1] === "!";
    const inner = match[2];

    const pipeIdx = inner.indexOf("|");
    const pathPart =
      pipeIdx >= 0 ? inner.slice(0, pipeIdx).trim() : inner.trim();
    const alias =
      pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : undefined;

    if (!pathPart) continue;

    const hashIdx = pathPart.indexOf("#");
    const target =
      hashIdx >= 0 ? pathPart.slice(0, hashIdx).trim() : pathPart;
    const heading =
      hashIdx >= 0 ? pathPart.slice(hashIdx + 1).trim() : undefined;

    if (!target) continue;

    // パストラバーサル拒否
    if (target.includes("..")) continue;

    links.push({
      raw: match[0],
      target,
      alias: alias || undefined,
      heading: heading || undefined,
      isEmbed,
    });
  }

  return links;
}

export function resolveWikiLinkPath(
  target: string,
  vaultPath: string,
  currentFilePath: string,
): string | null {
  if (target.includes("..")) return null;

  const resolved = resolve(dirname(currentFilePath), target);

  // vault配下か検証
  if (!resolved.startsWith(vaultPath)) return null;

  if (existsSync(resolved)) return resolved;
  if (!resolved.endsWith(".md") && existsSync(resolved + ".md"))
    return resolved + ".md";

  return null;
}
