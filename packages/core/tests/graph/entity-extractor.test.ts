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
    it("should extract person entities from @username patterns", () => {
      const content = "cc @alice @bob please review";
      const result = extractor.extract(content);
      const persons = result.filter((e) => e.entityType === "person");
      expect(persons.some((e) => e.name === "alice")).toBe(true);
      expect(persons.some((e) => e.name === "bob")).toBe(true);
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

    it("should not extract entities from markdown image URLs", () => {
      const content = "![screenshot](https://github.com/user-attachments/assets/image.png)";
      const result = extractor.extract(content);
      const names = result.map((e) => e.name);
      expect(names).not.toContain("com/user-attachments");
      expect(names).not.toContain("user-attachments/assets");
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
});
