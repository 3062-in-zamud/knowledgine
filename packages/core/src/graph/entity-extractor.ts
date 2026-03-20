import type { EntityType } from "../types.js";

export interface ExtractedEntity {
  name: string;
  entityType: EntityType;
  sourceType: "tag" | "import" | "link" | "code" | "mention" | "frontmatter";
}

/**
 * useState, useEffect などのReact hooks・ノイズキーワードのストップリスト
 */
const STOP_LIST = new Set([
  "usestate",
  "useeffect",
  "usecontext",
  "usereducer",
  "usecallback",
  "usememo",
  "useref",
  "console",
  "process",
  "module",
  "exports",
  "require",
  "import",
  "export",
  "default",
  "const",
  "let",
  "var",
  "function",
  "class",
  "return",
  "null",
  "undefined",
  "true",
  "false",
  "this",
  "new",
  "typeof",
  "instanceof",
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "any",
  "void",
  "never",
  "unknown",
  "error",
  "promise",
  "async",
  "await",
  "then",
  "catch",
  "finally",
  "try",
]);

/**
 * ノートテキストからエンティティを抽出する。
 */
export class EntityExtractor {
  extract(content: string, frontmatter: Record<string, unknown> = {}): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];

    results.push(...this.extractFromFrontmatterTags(frontmatter));
    results.push(...this.extractFromFrontmatterFields(frontmatter));
    results.push(...this.extractImports(content));
    results.push(...this.extractMarkdownLinks(content));
    results.push(...this.extractInlineCode(content));
    results.push(...this.extractMentions(content));
    results.push(...this.extractOrgRepos(content));

    return this.deduplicate(results);
  }

  private extractFromFrontmatterTags(frontmatter: Record<string, unknown>): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    const tags = frontmatter["tags"];
    if (!Array.isArray(tags)) return results;

    for (const tag of tags) {
      if (typeof tag !== "string" || tag.trim() === "") continue;
      const name = tag.trim().toLowerCase();
      if (this.isStopWord(name)) continue;
      results.push({ name, entityType: "technology", sourceType: "tag" });
    }
    return results;
  }

  private extractFromFrontmatterFields(frontmatter: Record<string, unknown>): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];

    // author/reviewer → person
    for (const field of ["author", "reviewer", "assignee"]) {
      const val = frontmatter[field];
      if (typeof val === "string" && val.trim()) {
        results.push({
          name: val.trim().toLowerCase(),
          entityType: "person",
          sourceType: "frontmatter",
        });
      } else if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === "string" && v.trim()) {
            results.push({
              name: v.trim().toLowerCase(),
              entityType: "person",
              sourceType: "frontmatter",
            });
          }
        }
      }
    }

    // project → project
    const project = frontmatter["project"];
    if (typeof project === "string" && project.trim()) {
      results.push({
        name: project.trim().toLowerCase(),
        entityType: "project",
        sourceType: "frontmatter",
      });
    }

    return results;
  }

  private extractImports(content: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    // import X from 'package' / import { X } from 'package' / require('package')
    const importRe = /(?:import\s+(?:.*?\s+from\s+)?|require\s*\(\s*)['"]([^'"./][^'"]*)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      const pkg = m[1].split("/")[0]; // @scope/pkg → @scope/pkg, lodash/fp → lodash
      if (!pkg || this.isStopWord(pkg)) continue;
      // Exclude destructured (e.g., import { useState } from 'react' → react is fine, but not useState)
      results.push({ name: pkg.toLowerCase(), entityType: "technology", sourceType: "import" });
    }
    return results;
  }

  private extractMarkdownLinks(content: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    // [text](url) — internal links might be entities
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(content)) !== null) {
      const text = m[1].trim();
      const url = m[2].trim();
      // Only external URLs or paths with meaningful names
      if (url.startsWith("http") && text && !this.isStopWord(text.toLowerCase())) {
        // Skip very long link texts (likely sentences)
        if (text.length <= 40 && !text.includes(" ")) {
          results.push({ name: text.toLowerCase(), entityType: "technology", sourceType: "link" });
        }
      }
    }
    return results;
  }

  private extractInlineCode(content: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    // `package-name` or `ClassName` patterns
    const codeRe = /`([^`\s]{2,30})`/g;
    let m: RegExpExecArray | null;
    while ((m = codeRe.exec(content)) !== null) {
      const code = m[1].trim();
      // Only include package-like names (kebab-case or single words)
      if (/^[@a-z][\w/-]*$/.test(code) && !this.isStopWord(code.toLowerCase())) {
        results.push({ name: code.toLowerCase(), entityType: "tool", sourceType: "code" });
      }
    }
    return results;
  }

  private extractMentions(content: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    // @username patterns
    const mentionRe = /@([\w-]{2,30})/g;
    let m: RegExpExecArray | null;
    while ((m = mentionRe.exec(content)) !== null) {
      const username = m[1].trim().toLowerCase();
      if (!this.isStopWord(username)) {
        results.push({ name: username, entityType: "person", sourceType: "mention" });
      }
    }
    return results;
  }

  private extractOrgRepos(content: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    // org/repo patterns (e.g., facebook/react, microsoft/typescript)
    const orgRepoRe = /\b([a-z][\w-]{1,30})\/([a-z][\w-]{1,30})\b/g;
    let m: RegExpExecArray | null;
    while ((m = orgRepoRe.exec(content)) !== null) {
      const fullName = `${m[1]}/${m[2]}`.toLowerCase();
      if (!this.isStopWord(m[1]) && !this.isStopWord(m[2])) {
        results.push({ name: fullName, entityType: "project", sourceType: "frontmatter" });
      }
    }
    return results;
  }

  private isStopWord(word: string): boolean {
    return STOP_LIST.has(word.toLowerCase());
  }

  private deduplicate(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Map<string, ExtractedEntity>();
    for (const e of entities) {
      const key = `${e.entityType}:${e.name}`;
      if (!seen.has(key)) {
        seen.set(key, e);
      }
    }
    return Array.from(seen.values());
  }
}
