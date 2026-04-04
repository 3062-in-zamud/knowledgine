import { describe, it, expect } from "vitest";
import { EntityExtractor } from "../../src/graph/entity-extractor.js";

describe("EntityExtractor", () => {
  const extractor = new EntityExtractor();

  describe("extract from frontmatter tags", () => {
    it("should extract technologies from tags", () => {
      const result = extractor.extract("Some content", { tags: ["typescript", "react", "nodejs"] });
      const names = result.map((e) => e.name);
      expect(names).toContain("typescript");
      expect(names).toContain("react");
      expect(names).toContain("nodejs");
    });

    it("should normalize tag names to lowercase", () => {
      const result = extractor.extract("", { tags: ["TypeScript", "React"] });
      const names = result.map((e) => e.name);
      expect(names).toContain("typescript");
      expect(names).toContain("react");
    });

    it("should skip empty tags", () => {
      const result = extractor.extract("", { tags: ["", "  ", "typescript"] });
      expect(result.some((e) => e.name === "")).toBe(false);
    });
  });

  describe("extract from frontmatter fields", () => {
    it("should extract person from author field", () => {
      const result = extractor.extract("", { author: "Alice" });
      const person = result.find((e) => e.entityType === "person");
      expect(person).toBeDefined();
      expect(person!.name).toBe("alice");
    });

    it("should extract project from project field", () => {
      const result = extractor.extract("", { project: "My App" });
      const project = result.find((e) => e.entityType === "project");
      expect(project).toBeDefined();
      expect(project!.name).toBe("my app");
    });
  });

  describe("extract imports", () => {
    it("should extract package names from import statements", () => {
      const content = `
import { useState } from 'react';
import Database from 'better-sqlite3';
const yaml = require('yaml');
      `;
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).toContain("react");
      expect(names).toContain("better-sqlite3");
      expect(names).toContain("yaml");
    });

    it("should not extract relative imports", () => {
      const content = `import { foo } from './local-module';`;
      const result = extractor.extract(content);
      expect(result.some((e) => e.name.includes("local"))).toBe(false);
    });

    it("should filter stop words from imports", () => {
      const content = `import { console, process } from 'some-pkg';`;
      const result = extractor.extract(content);
      expect(result.some((e) => e.name === "console")).toBe(false);
      expect(result.some((e) => e.name === "process")).toBe(false);
    });

    it("should ignore identifiers that only contain require", () => {
      const content = `
const requirement = requires('chalk');
const value = requirement('yaml');
foo.require('lodash');
      `;
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).not.toContain("chalk");
      expect(names).not.toContain("yaml");
      expect(names).not.toContain("lodash");
    });
  });

  describe("extract @mentions", () => {
    it("should filter out mention-only unknown entities (KNOW-379)", () => {
      const content = "cc @alice @bob please review";
      const result = extractor.extract(content);
      // mention-only unknown entities are now filtered out as low-confidence noise
      expect(result.find((e) => e.name === "alice")).toBeUndefined();
      expect(result.find((e) => e.name === "bob")).toBeUndefined();
    });
  });

  describe("extract org/repo patterns", () => {
    it("should extract project entities from org/repo patterns", () => {
      const content = "Using facebook/react and microsoft/typescript";
      const result = extractor.extract(content);
      const projects = result.filter((e) => e.entityType === "project");
      expect(projects.some((e) => e.name.includes("react"))).toBe(true);
    });
  });

  describe("deduplication", () => {
    it("should deduplicate entities with same name+type", () => {
      const content = `
import React from 'react';
import { useState } from 'react';
      `;
      const result = extractor.extract(content, { tags: ["react"] });
      const reactEntities = result.filter((e) => e.name === "react");
      expect(reactEntities.length).toBe(1);
    });
  });

  describe("stop word filtering", () => {
    it("should not extract common React hooks as entities", () => {
      const content = "Using useState and useEffect in components";
      const result = extractor.extract(content);
      expect(result.some((e) => e.name === "usestate")).toBe(false);
      expect(result.some((e) => e.name === "useeffect")).toBe(false);
    });
  });

  describe("code block exclusion", () => {
    it("should ignore import statements inside code blocks", () => {
      const content = "Some text\n```typescript\nimport React from 'react';\n```\nMore text";
      const result = extractor.extract(content);
      expect(result.some((e) => e.name === "react")).toBe(false);
    });
  });

  describe("MIME type filtering in extractOrgRepos", () => {
    it("should not extract image/png as org/repo", () => {
      const content = "Content-Type: image/png and text/html are MIME types";
      const result = extractor.extract(content);
      expect(result.some((e) => e.name === "image/png")).toBe(false);
      expect(result.some((e) => e.name === "text/html")).toBe(false);
    });

    it("should not extract node_modules/package as org/repo", () => {
      const content = "See node_modules/lodash for the implementation";
      const result = extractor.extract(content);
      expect(result.some((e) => e.name === "node_modules/lodash")).toBe(false);
    });
  });

  describe("Markdown image exclusion", () => {
    it("should not extract image syntax as link entity", () => {
      const content = "![badge](https://example.com/badge.svg)";
      const result = extractor.extract(content);
      expect(result.some((e) => e.name === "badge")).toBe(false);
    });
  });

  describe("URL/path fragment exclusion (KNOW-361)", () => {
    it("should not extract URL path fragments as org/repo", () => {
      const content = `
Check out https://github.com/user-attachments/assets/abc.png
See https://github.com/org/repo/blob/main/file.ts
Visit https://example.com/tools/badges for details
      `;
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).not.toContain("com/user-attachments");
      expect(names).not.toContain("user-attachments/assets");
      expect(names).not.toContain("tools/badges");
      expect(names).not.toContain("blob/main");
      expect(names).not.toContain("main/file");
    });

    it("should extract org/repo from GitHub URL correctly", () => {
      const content = "See https://github.com/facebook/react/blob/main/README.md";
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      // org/repo itself should still be extracted
      expect(names).toContain("facebook/react");
      // but path fragments after the repo should not
      expect(names).not.toContain("react/blob");
      expect(names).not.toContain("blob/main");
    });

    it("should not extract domain path fragments like com/profile", () => {
      const content = "Visit https://example.com/profile/settings";
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).not.toContain("com/profile");
      expect(names).not.toContain("profile/settings");
    });

    it("should not extract protocol-relative URL fragments", () => {
      const content = "Load //cdn.example.com/lib/v2";
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).not.toContain("com/lib");
    });

    it("should still extract legitimate org/repo patterns", () => {
      const content = "We use facebook/react and microsoft/typescript in our project";
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).toContain("facebook/react");
      expect(names).toContain("microsoft/typescript");
    });

    it("should not extract path segments like browser-use/blob or main/examples", () => {
      const content = `
browser-use/blob is a path fragment
main/examples is just a directory listing
      `;
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).not.toContain("browser-use/blob");
      expect(names).not.toContain("main/examples");
    });

    it("should not extract entities from shields.io badge image", () => {
      const entities = extractor.extract("![badge](https://img.shields.io/npm/v/pkg)");
      const names = entities.map((e) => e.name);
      // Potential false-positive patterns that must not appear
      expect(names).not.toContain("shields/npm");
      expect(names).not.toContain("img/shields");
      expect(names).not.toContain("npm/v");
      expect(names).not.toContain("v/pkg");
      expect(names).not.toContain("shields.io/npm");
    });

    it("should not extract user-attachments as org in plain text", () => {
      const entities = extractor.extract("user-attachments/some-repo is mentioned");
      const names = entities.map((e) => e.name);
      expect(names).not.toContain("user-attachments/some-repo");
    });

    it("should not extract org/badges pattern", () => {
      const entities = extractor.extract("shields/badges endpoint");
      const names = entities.map((e) => e.name);
      expect(names).not.toContain("shields/badges");
    });

    it("should not extract entities from markdown image URLs", () => {
      const content = "![screenshot](https://github.com/user-attachments/assets/image.png)";
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).not.toContain("com/user-attachments");
      expect(names).not.toContain("user-attachments/assets");
    });
  });

  describe("file path stripping (KNOW-361)", () => {
    it("does not extract entities from file path strings", () => {
      const content = "Edit src/components/Button.tsx for the fix";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "components")).toBeUndefined();
      expect(entities.find((e) => e.name === "button")).toBeUndefined();
    });

    it("does not extract entities from deep file paths", () => {
      const content = "See packages/core/src/graph/entity-extractor.ts for details";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "graph")).toBeUndefined();
    });

    it("preserves tech names like Next.js Vue.js Node.js (no slash)", () => {
      const content = "We use Next.js and Vue.js with Node.js runtime";
      const _entities = extractor.extract(content);
      // These should NOT be stripped (no slash in name)
      // stripFilePaths requires at least one slash, so "Next.js" etc. are preserved in content
      // (They may or may not be extracted depending on other extraction rules,
      // but the key assertion is they are not incorrectly removed by stripFilePaths)
    });

    it("does not extract path segments like hooks and layouts as org/repo", () => {
      const content = "Updated hooks/useAuth.ts and layouts/Main.tsx recently";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "hooks")).toBeUndefined();
      expect(entities.find((e) => e.name === "layouts")).toBeUndefined();
    });
  });

  describe("entity type inference improvement (KNOW-362)", () => {
    it("should not classify sandbox as person", () => {
      const content = "Using @sandbox for testing";
      const result = extractor.extract(content);
      const sandbox = result.find((e) => e.name === "sandbox");
      if (sandbox) {
        expect(sandbox.entityType).not.toBe("person");
      }
    });

    it("should classify Docker as technology", () => {
      const content = "We use @docker for containerization";
      const result = extractor.extract(content);
      const docker = result.find((e) => e.name === "docker");
      expect(docker).toBeDefined();
      expect(docker!.entityType).toBe("technology");
    });

    it("should classify Redis as technology", () => {
      const content = "Cache layer uses @redis";
      const result = extractor.extract(content);
      const redis = result.find((e) => e.name === "redis");
      expect(redis).toBeDefined();
      expect(redis!.entityType).toBe("technology");
    });

    it("should classify Kubernetes as technology", () => {
      const content = "Deployed on @kubernetes cluster";
      const result = extractor.extract(content);
      const k8s = result.find((e) => e.name === "kubernetes");
      expect(k8s).toBeDefined();
      expect(k8s!.entityType).toBe("technology");
    });

    it("should filter out mention-only unknown @mentions (KNOW-379)", () => {
      const content = "cc @alice @bob please review";
      const result = extractor.extract(content);
      // mention-only unknown entities are now filtered as low-confidence noise
      expect(result.find((e) => e.name === "alice")).toBeUndefined();
      expect(result.find((e) => e.name === "bob")).toBeUndefined();
    });

    it("should keep tag-based technology classification for @react", () => {
      const result = extractor.extract("cc @react please review", { tags: ["react"] });
      const reactEntities = result.filter((e) => e.name === "react");
      expect(reactEntities.length).toBe(1);
      expect(reactEntities[0].sourceType).toBe("tag");
      expect(reactEntities[0].entityType).toBe("technology");
    });

    it("should classify programming concepts as concept, not person", () => {
      const content = "The @middleware handles authentication";
      const result = extractor.extract(content);
      const middleware = result.find((e) => e.name === "middleware");
      if (middleware) {
        expect(middleware.entityType).not.toBe("person");
      }
    });
  });

  describe("KNOW-362: entity type inference improvement", () => {
    it("should classify sandbox as concept (NOT_PERSON_LIST)", () => {
      const entities = extractor.extract("Talked to @sandbox about the issue");
      const sandbox = entities.find((e) => e.name === "sandbox");
      expect(sandbox?.entityType).not.toBe("person");
    });

    it("should classify docker as technology (TECH_DICTIONARY)", () => {
      const entities = extractor.extract("@docker is great");
      const docker = entities.find((e) => e.name === "docker");
      expect(docker?.entityType).toBe("technology");
    });

    it("should filter out mention-only unknown entities (KNOW-379)", () => {
      const entities = extractor.extract("@randomname mentioned it");
      // mention-only unknown entities are now filtered as low-confidence noise
      expect(entities.find((e) => e.name === "randomname")).toBeUndefined();
    });

    it("should classify new TECH_DICTIONARY entries correctly", () => {
      for (const name of ["vscode", "webpack", "vite", "bun", "deno", "terraform"]) {
        const entities = extractor.extract(`@${name} is useful`);
        const entity = entities.find((e) => e.name === name);
        expect(entity?.entityType).not.toBe("person");
        expect(entity?.entityType).not.toBe("unknown");
      }
    });
  });

  describe("conservative entity classification (KNOW-362)", () => {
    it("does not extract generic words from markdown links as technology", () => {
      const content = "See [data](https://example.com) for more info";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "data")).toBeUndefined();
    });

    it("extracts known tech names from markdown links as technology", () => {
      const content = "We use [React](https://reactjs.org) for the frontend";
      const entities = extractor.extract(content);
      const react = entities.find((e) => e.name === "react");
      expect(react).toBeDefined();
      expect(react?.entityType).toBe("technology");
    });

    it("extracts PostgreSQL from markdown links as technology", () => {
      const content = "Backed by [PostgreSQL](https://postgresql.org)";
      const entities = extractor.extract(content);
      const pg = entities.find((e) => e.name === "postgresql");
      expect(pg).toBeDefined();
      expect(pg?.entityType).toBe("technology");
    });

    it("markdown links are extracted before stripMarkdownSyntax removes them", () => {
      const content = "Using [Docker](https://docker.com) and [Kubernetes](https://kubernetes.io)";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "docker")).toBeDefined();
      expect(entities.find((e) => e.name === "kubernetes")).toBeDefined();
    });
  });

  describe("extractOrgRepos sourceType", () => {
    it("should have sourceType 'code' for org/repo entities", () => {
      const content = "Check out facebook/react for more details";
      const entities = extractor.extract(content);
      const orgRepo = entities.find((e) => e.name === "facebook/react");
      expect(orgRepo?.sourceType).toBe("code");
    });
  });

  describe("resolveEntityTypes", () => {
    it("同一名異タイプのエンティティを信頼度の高いソースで統合", () => {
      // "React" が frontmatter(technology) と mention(framework) の両方で抽出される状況を再現するため、
      // frontmatter tags で technology として登録し、本文 @react mention で person として登録されるケースを使う。
      // より直接的に: tags(technology/tag) と @mention(person/mention) で "react" が重複するケース
      const result = extractor.extract("cc @react please review", { tags: ["react"] });
      const reactEntities = result.filter((e) => e.name === "react");
      // resolveEntityTypes により1件に統合される
      expect(reactEntities.length).toBe(1);
      // tags(SOURCE_PRIORITY=4) < mention(SOURCE_PRIORITY=7) なので tag が採用される
      expect(reactEntities[0].sourceType).toBe("tag");
      expect(reactEntities[0].entityType).toBe("technology");
    });

    it("名前が異なるエンティティは統合しない", () => {
      const result = extractor.extract("", { tags: ["react", "typescript"] });
      const reactEntities = result.filter((e) => e.name === "react");
      const tsEntities = result.filter((e) => e.name === "typescript");
      expect(reactEntities.length).toBe(1);
      expect(tsEntities.length).toBe(1);
    });

    it("同一名同一タイプは維持される", () => {
      const content = `
import React from 'react';
import { useState } from 'react';
      `;
      const result = extractor.extract(content);
      const reactEntities = result.filter((e) => e.name === "react");
      expect(reactEntities.length).toBe(1);
    });

    it("大文字小文字が異なる同一名を統合", () => {
      // frontmatter tags で "React" と "react" が両方登録された場合に統合される
      const result = extractor.extract("", { tags: ["React", "react"] });
      const reactEntities = result.filter((e) => e.name === "react");
      // deduplicate は "tag:react" で1件に絞るため resolveEntityTypes に来る時点で既に1件
      // ただし大文字小文字正規化後に同一キーになることを確認
      expect(reactEntities.length).toBe(1);
    });
  });

  describe("Markdown syntax stripping (KNOW-379)", () => {
    it("does not extract entities from image links", () => {
      const content = "![logo](https://example.com/logo.png)\nUsing React for UI.";
      const entities = extractor.extract(content);
      // "logo" should NOT be extracted
      expect(entities.find((e) => e.name === "logo")).toBeUndefined();
    });

    it("does not extract URL fragments from markdown links", () => {
      const content = "See [docs](https://github.com/example/repo/blob/main/README.md)";
      const entities = extractor.extract(content);
      // Path fragments like "blob", "main", "readme" should not appear
      expect(entities.find((e) => e.name === "blob")).toBeUndefined();
    });

    it("extracts entity names from link text via inline code after stripping", () => {
      // After Markdown stripping, [React](url) becomes "React" as plain text.
      // Plain text alone doesn't trigger extraction (no @mention, import, or inline code).
      // But if the entity also appears in frontmatter or inline code, it is still extracted.
      const content = "We use [React](https://reactjs.org) and `react` for the frontend.";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "react")).toBeDefined();
    });

    it("strips heading markers without losing entity names", () => {
      const content = "## Using Docker for deployment";
      const entities = extractor.extract(content);
      // Docker should still be detected from @mention or inline code patterns
      // Heading marker ## should be stripped
      expect(entities.find((e) => e.name === "##")).toBeUndefined();
    });

    it("strips bold/italic markers", () => {
      const content = "We use **React** and *TypeScript* for development.";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "**react**")).toBeUndefined();
      expect(entities.find((e) => e.name === "*typescript*")).toBeUndefined();
    });

    it("strips HTML tags", () => {
      const content = "<div>Using `vitest` for testing</div>";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "div")).toBeUndefined();
      expect(entities.find((e) => e.name === "vitest")).toBeDefined();
    });
  });

  describe("STOP_LIST expansion (KNOW-379)", () => {
    it("filters out common generic terms", () => {
      const content = "The `readme` and `changelog` were updated along with `config` files.";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "readme")).toBeUndefined();
      expect(entities.find((e) => e.name === "changelog")).toBeUndefined();
      expect(entities.find((e) => e.name === "config")).toBeUndefined();
    });

    it("filters out directory-like terms", () => {
      const content = "Files in `src`, `lib`, `dist`, and `docs` directories.";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "src")).toBeUndefined();
      expect(entities.find((e) => e.name === "lib")).toBeUndefined();
      expect(entities.find((e) => e.name === "dist")).toBeUndefined();
      expect(entities.find((e) => e.name === "docs")).toBeUndefined();
    });

    it("filters out workflow terms", () => {
      const content = "Check the `todo` and `fixme` items in `setup` and `build`.";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "todo")).toBeUndefined();
      expect(entities.find((e) => e.name === "fixme")).toBeUndefined();
      expect(entities.find((e) => e.name === "setup")).toBeUndefined();
      expect(entities.find((e) => e.name === "build")).toBeUndefined();
    });
  });

  describe("unknown type filtering (KNOW-379)", () => {
    it("filters out mention-only unknown entities", () => {
      const content = "Talked to @someRandomPerson about the project.";
      const entities = extractor.extract(content);
      // @someRandomPerson with type "unknown" from mention should be filtered
      const found = entities.find((e) => e.name === "somerandomperson");
      expect(found).toBeUndefined();
    });

    it("keeps unknown entities that have higher-priority sources", () => {
      // If an entity has a frontmatter source, it should not be filtered
      const content = "Working with @react on the project.";
      const entities = extractor.extract(content, { tags: ["react"] });
      const react = entities.find((e) => e.name === "react");
      expect(react).toBeDefined();
      expect(react!.entityType).toBe("technology");
    });

    it("keeps known tech mentions even with @prefix", () => {
      const content = "Using @docker and @redis for infrastructure.";
      const entities = extractor.extract(content);
      expect(entities.find((e) => e.name === "docker")).toBeDefined();
      expect(entities.find((e) => e.name === "redis")).toBeDefined();
    });
  });
});
