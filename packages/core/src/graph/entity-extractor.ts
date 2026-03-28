import type { EntityType } from "../types.js";
import type { ExtractionRules } from "../feedback/feedback-learner.js";
import { CodeBlockDetector } from "../utils/code-block-detector.js";

export interface ExtractedEntity {
  name: string;
  entityType: EntityType;
  sourceType: "tag" | "import" | "link" | "code" | "mention" | "frontmatter" | "whitelist";
}

const SOURCE_PRIORITY: Record<ExtractedEntity["sourceType"], number> = {
  frontmatter: 1, // YAML frontmatterに明記 → 最も信頼性高
  whitelist: 2, // ユーザー定義のホワイトリスト
  import: 3, // import文 → 技術エンティティとして確実
  tag: 4, // Markdownタグ
  code: 5, // コードブロック内
  link: 6, // リンクテキスト
  mention: 7, // 本文中のメンション → 最も曖昧
};

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
  "div",
  "span",
  "input",
  "form",
  "type",
  "style",
  "script",
  "link",
  "meta",
  "head",
  "body",
]);

/**
 * Extracts entities from note text, with optional post-processing via ExtractionRules.
 */
/**
 * Known technology/tool names that should never be classified as person.
 * Maps to preferred entity type.
 */
const TECH_DICTIONARY = new Map<string, EntityType>([
  // Databases
  ["redis", "technology"],
  ["postgresql", "technology"],
  ["postgres", "technology"],
  ["mongodb", "technology"],
  ["mysql", "technology"],
  ["sqlite", "technology"],
  ["elasticsearch", "technology"],
  ["dynamodb", "technology"],
  ["cassandra", "technology"],
  // Containers & orchestration
  ["docker", "technology"],
  ["kubernetes", "technology"],
  ["podman", "technology"],
  // Web servers & proxies
  ["nginx", "technology"],
  ["apache", "technology"],
  ["caddy", "technology"],
  ["traefik", "technology"],
  // Languages & runtimes
  ["python", "technology"],
  ["golang", "technology"],
  ["rust", "technology"],
  ["swift", "technology"],
  ["kotlin", "technology"],
  ["deno", "technology"],
  ["bun", "technology"],
  // Frameworks & libraries
  ["react", "technology"],
  ["angular", "technology"],
  ["vue", "technology"],
  ["svelte", "technology"],
  ["django", "technology"],
  ["flask", "technology"],
  ["express", "technology"],
  ["fastapi", "technology"],
  ["nextjs", "technology"],
  ["nuxt", "technology"],
  // Tools
  ["webpack", "tool"],
  ["vite", "tool"],
  ["eslint", "tool"],
  ["prettier", "tool"],
  ["babel", "tool"],
  ["terraform", "tool"],
  ["ansible", "tool"],
  ["grafana", "tool"],
  ["prometheus", "tool"],
  // Cloud & services
  ["vercel", "technology"],
  ["netlify", "technology"],
  ["heroku", "technology"],
  ["supabase", "technology"],
  ["firebase", "technology"],
]);

/**
 * Programming concepts that should not be classified as person.
 */
const NOT_PERSON_LIST = new Set([
  "sandbox",
  "middleware",
  "proxy",
  "daemon",
  "worker",
  "handler",
  "listener",
  "observer",
  "adapter",
  "bridge",
  "factory",
  "builder",
  "parser",
  "compiler",
  "runtime",
  "kernel",
  "scheduler",
  "dispatcher",
  "controller",
  "resolver",
  "navigator",
  "provider",
  "consumer",
  "producer",
  "generator",
  "iterator",
  "executor",
  "loader",
  "renderer",
  "emitter",
  "pipeline",
  "gateway",
  "registry",
  "container",
  "server",
  "client",
  "agent",
  "bot",
  "cli",
  "api",
  "sdk",
  "env",
  "config",
  "admin",
  "debug",
  "staging",
  "production",
  "development",
  "localhost",
  "webhook",
  "cron",
  "cache",
  "queue",
  "stack",
  "heap",
  "buffer",
]);

export class EntityExtractor {
  private rules?: ExtractionRules;

  private static readonly MIME_PREFIXES = new Set([
    "image",
    "text",
    "application",
    "audio",
    "video",
    "multipart",
    "font",
    "model",
    "message",
  ]);

  private static readonly PATH_SEGMENTS = new Set([
    "node_modules",
    "src",
    "lib",
    "dist",
    "bin",
    "test",
    "tests",
    "docs",
    "config",
    "public",
    "assets",
    "static",
    "com",
    "org",
    "net",
    "io",
    "dev",
    "tools",
    "blob",
    "tree",
    "main",
    "master",
    "profile",
    "api",
    "raw",
    "releases",
    "actions",
    "settings",
    "examples",
    "wiki",
    "issues",
    "pulls",
    "packages",
  ]);

  constructor(rules?: ExtractionRules) {
    this.rules = rules;
  }

  extract(content: string, frontmatter: Record<string, unknown> = {}): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];

    const detector = new CodeBlockDetector();
    const codeBlocks = detector.detectCodeBlocks(content);
    const lines = content.split("\n");
    const filtered = detector.filterNonCodeLines(lines, codeBlocks);
    const cleanContent = filtered.map((l) => l.line).join("\n");

    results.push(...this.extractFromFrontmatterTags(frontmatter));
    results.push(...this.extractFromFrontmatterFields(frontmatter));
    results.push(...this.extractImports(cleanContent));
    results.push(...this.extractMarkdownLinks(cleanContent));
    results.push(...this.extractInlineCode(cleanContent));
    results.push(...this.extractMentions(cleanContent));
    results.push(...this.extractOrgRepos(cleanContent));

    let deduped = this.deduplicate(results);
    deduped = this.resolveEntityTypes(deduped);

    if (this.rules) {
      deduped = this.applyRules(deduped);
    }

    return deduped;
  }

  private applyRules(entities: ExtractedEntity[]): ExtractedEntity[] {
    const rules = this.rules!;

    // 1. Filter out blacklisted entities
    let filtered = entities.filter((e) => !rules.entityBlacklist.includes(e.name));

    // 2. Apply type overrides
    filtered = filtered.map((e) => {
      const override = rules.typeOverrides.find(
        (o) => o.name === e.name && o.fromType === e.entityType,
      );
      if (override) {
        return { ...e, entityType: override.toType as EntityType };
      }
      return e;
    });

    // 3. Add whitelisted entities (if not already present)
    for (const wl of rules.entityWhitelist) {
      const key = `${wl.type}:${wl.name}`;
      const exists = filtered.some((e) => `${e.entityType}:${e.name}` === key);
      if (!exists) {
        filtered.push({
          name: wl.name,
          entityType: wl.type as EntityType,
          sourceType: "whitelist",
        });
      }
    }

    return filtered;
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
    const seen = new Set<string>();
    for (const rawLine of content.split(/\r?\n/)) {
      const specifier = this.extractImportSpecifier(rawLine.trim());
      if (!specifier || specifier.startsWith(".") || specifier.startsWith("/")) continue;

      const pkg = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      const normalized = pkg.toLowerCase();
      if (!pkg || this.isStopWord(normalized) || seen.has(normalized)) continue;

      seen.add(normalized);
      results.push({ name: normalized, entityType: "technology", sourceType: "import" });
    }
    return results;
  }

  private extractImportSpecifier(line: string): string | null {
    if (!line) return null;

    if (line.startsWith("import ")) {
      const fromIndex = line.lastIndexOf(" from ");
      const quoteIndex =
        fromIndex >= 0
          ? this.findQuoteIndex(line, fromIndex + " from ".length)
          : this.findQuoteIndex(line, "import ".length);
      return quoteIndex >= 0 ? this.readQuotedValue(line, quoteIndex) : null;
    }

    const requireIndex = this.findStandaloneRequireIndex(line);
    if (requireIndex >= 0) {
      const openParenIndex = this.findRequireCallOpenParenIndex(
        line,
        requireIndex + "require".length,
      );
      if (openParenIndex < 0) return null;
      const quoteIndex = this.findQuoteIndex(line, openParenIndex + 1);
      return quoteIndex >= 0 ? this.readQuotedValue(line, quoteIndex) : null;
    }

    return null;
  }

  private findStandaloneRequireIndex(line: string): number {
    let searchIndex = 0;

    while (searchIndex < line.length) {
      const requireIndex = line.indexOf("require", searchIndex);
      if (requireIndex < 0) return -1;

      const prevChar = requireIndex > 0 ? line[requireIndex - 1] : "";
      const nextIndex = requireIndex + "require".length;
      const nextChar = nextIndex < line.length ? line[nextIndex] : "";

      if (
        prevChar !== "." &&
        !this.isIdentifierChar(prevChar) &&
        !this.isIdentifierChar(nextChar)
      ) {
        return requireIndex;
      }

      searchIndex = nextIndex;
    }

    return -1;
  }

  private findRequireCallOpenParenIndex(line: string, startIndex: number): number {
    for (let i = startIndex; i < line.length; i++) {
      const char = line[i];
      if (char === "(") {
        return i;
      }
      if (char !== " " && char !== "\t") {
        return -1;
      }
    }

    return -1;
  }

  private findQuoteIndex(line: string, startIndex: number): number {
    for (let i = startIndex; i < line.length; i++) {
      if (line[i] === "'" || line[i] === '"') {
        return i;
      }
    }
    return -1;
  }

  private readQuotedValue(line: string, quoteIndex: number): string | null {
    const quote = line[quoteIndex];
    const endQuoteIndex = line.indexOf(quote, quoteIndex + 1);
    if (endQuoteIndex < 0) return null;
    return line.slice(quoteIndex + 1, endQuoteIndex);
  }

  private extractMarkdownLinks(content: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    // [text](url) — internal links might be entities (exclude image syntax ![ )
    const linkRe = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
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
      if (this.isStopWord(username)) continue;
      const { entityType, sourceType } = this.classifyMention(username);
      results.push({ name: username, entityType, sourceType });
    }
    return results;
  }

  private classifyMention(name: string): {
    entityType: EntityType;
    sourceType: ExtractedEntity["sourceType"];
  } {
    const techType = TECH_DICTIONARY.get(name);
    if (techType) return { entityType: techType, sourceType: "mention" };
    if (NOT_PERSON_LIST.has(name)) return { entityType: "concept", sourceType: "mention" };
    return { entityType: "person", sourceType: "mention" };
  }

  private extractOrgRepos(content: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    const cleanContent = this.stripUrls(content);
    // org/repo patterns (e.g., facebook/react, microsoft/typescript)
    const orgRepoRe = /\b([a-z][\w-]{1,30})\/([a-z][\w-]{1,30})\b/g;
    let m: RegExpExecArray | null;
    while ((m = orgRepoRe.exec(cleanContent)) !== null) {
      const org = m[1].toLowerCase();
      const repo = m[2].toLowerCase();
      if (EntityExtractor.MIME_PREFIXES.has(org)) continue;
      if (EntityExtractor.PATH_SEGMENTS.has(org)) continue;
      if (EntityExtractor.PATH_SEGMENTS.has(repo)) continue;
      const fullName = `${org}/${repo}`;
      if (!this.isStopWord(org) && !this.isStopWord(repo)) {
        results.push({ name: fullName, entityType: "project", sourceType: "code" });
      }
    }
    // Also extract org/repo from GitHub URLs specifically
    results.push(...this.extractOrgReposFromUrls(content));
    return results;
  }

  /**
   * Strip URLs from content, replacing them with whitespace to prevent
   * URL path fragments from being matched as org/repo.
   */
  private stripUrls(content: string): string {
    // Match http(s):// URLs and protocol-relative //
    return content.replace(/(?:https?:\/\/|\/\/)[^\s)>\]]+/g, " ");
  }

  /**
   * Extract org/repo from GitHub URLs (e.g., github.com/org/repo/...).
   * Only extracts the org/repo portion, not deeper path segments.
   */
  private extractOrgReposFromUrls(content: string): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    const githubUrlRe = /github\.com\/([a-z][\w-]{1,30})\/([a-z][\w-]{1,30})/gi;
    let m: RegExpExecArray | null;
    while ((m = githubUrlRe.exec(content)) !== null) {
      const org = m[1].toLowerCase();
      const repo = m[2].toLowerCase();
      if (EntityExtractor.MIME_PREFIXES.has(org)) continue;
      if (EntityExtractor.PATH_SEGMENTS.has(org)) continue;
      if (EntityExtractor.PATH_SEGMENTS.has(repo)) continue;
      if (this.isStopWord(org) || this.isStopWord(repo)) continue;
      results.push({ name: `${org}/${repo}`, entityType: "project", sourceType: "code" });
    }
    return results;
  }

  private isStopWord(word: string): boolean {
    return STOP_LIST.has(word.toLowerCase());
  }

  private isIdentifierChar(char: string): boolean {
    return (
      (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z") ||
      (char >= "0" && char <= "9") ||
      char === "_" ||
      char === "$"
    );
  }

  private resolveEntityTypes(entities: ExtractedEntity[]): ExtractedEntity[] {
    const byName = new Map<string, ExtractedEntity[]>();
    for (const e of entities) {
      const key = e.name.toLowerCase();
      const group = byName.get(key) ?? [];
      group.push(e);
      byName.set(key, group);
    }
    return Array.from(byName.values()).map((group) => {
      if (group.length === 1) return group[0];
      return group.sort((a, b) => SOURCE_PRIORITY[a.sourceType] - SOURCE_PRIORITY[b.sourceType])[0];
    });
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
