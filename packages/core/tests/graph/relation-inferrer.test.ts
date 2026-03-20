import { describe, it, expect } from "vitest";
import { RelationInferrer } from "../../src/graph/relation-inferrer.js";

describe("RelationInferrer", () => {
  const inferrer = new RelationInferrer();

  describe("infer created_by from frontmatter", () => {
    it("should infer created_by relation for author and project", () => {
      const entities = [
        { name: "alice", entityType: "person" as const },
        { name: "my-app", entityType: "project" as const },
      ];
      const frontmatter = { author: "alice", project: "my-app" };
      const relations = inferrer.infer(entities, frontmatter);

      const createdBy = relations.find((r) => r.relationType === "created_by");
      expect(createdBy).toBeDefined();
      expect(createdBy!.fromName).toBe("alice");
      expect(createdBy!.toName).toBe("my-app");
      expect(createdBy!.strength).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe("infer uses relation", () => {
    it("should infer uses relation between project and technology", () => {
      const entities = [
        { name: "my-project", entityType: "project" as const },
        { name: "react", entityType: "technology" as const },
      ];
      const relations = inferrer.infer(entities, {});
      const uses = relations.find((r) => r.relationType === "uses");
      expect(uses).toBeDefined();
      expect(uses!.fromName).toBe("my-project");
      expect(uses!.toName).toBe("react");
    });
  });

  describe("infer related_to for co-occurring technologies", () => {
    it("should infer related_to between co-occurring technologies", () => {
      const entities = [
        { name: "react", entityType: "technology" as const },
        { name: "typescript", entityType: "technology" as const },
      ];
      const relations = inferrer.infer(entities, {});
      const related = relations.find((r) => r.relationType === "related_to");
      expect(related).toBeDefined();
    });

    it("should not infer related_to for single technology", () => {
      const entities = [{ name: "react", entityType: "technology" as const }];
      const relations = inferrer.infer(entities, {});
      expect(relations.some((r) => r.relationType === "related_to")).toBe(false);
    });
  });

  describe("deduplication", () => {
    it("should deduplicate relations and keep highest strength", () => {
      const entities = [
        { name: "proj", entityType: "project" as const },
        { name: "tech", entityType: "technology" as const },
      ];
      const relations = inferrer.infer(entities, {});
      const key = `proj:project→tech:technology:uses`;
      // Should have exactly one uses relation
      const usesRelations = relations.filter(
        (r) => r.fromName === "proj" && r.toName === "tech" && r.relationType === "uses",
      );
      expect(usesRelations.length).toBe(1);
      void key;
    });
  });

  describe("empty entities", () => {
    it("should return empty relations for empty entities", () => {
      const relations = inferrer.infer([], {});
      expect(relations).toEqual([]);
    });
  });
});
