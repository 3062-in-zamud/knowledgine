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
});
