import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { normalizeEntityName } from "../../src/graph/entity-utils.js";
import { GraphRepository } from "../../src/graph/graph-repository.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("normalizeEntityName", () => {
  it("converts underscores to hyphens", () => {
    expect(normalizeEntityName("voicevox_core")).toBe("voicevox-core");
  });

  it("preserves already-hyphenated names", () => {
    expect(normalizeEntityName("react-native")).toBe("react-native");
  });

  it("normalizes mixed separators", () => {
    expect(normalizeEntityName("my__weird--name")).toBe("my-weird-name");
  });

  it("preserves slash as org/repo separator", () => {
    expect(normalizeEntityName("facebook/react")).toBe("facebook/react");
  });

  it("normalizes segments independently around slash", () => {
    expect(normalizeEntityName("my_org/my_repo")).toBe("my-org/my-repo");
  });

  it("lowercases input", () => {
    expect(normalizeEntityName("React-Native")).toBe("react-native");
  });

  it("strips leading/trailing hyphens from segments", () => {
    expect(normalizeEntityName("-leading-")).toBe("leading");
    expect(normalizeEntityName("_trailing_")).toBe("trailing");
  });

  it("handles empty string", () => {
    expect(normalizeEntityName("")).toBe("");
  });

  it("handles single character", () => {
    expect(normalizeEntityName("a")).toBe("a");
  });

  it("preserves Japanese characters", () => {
    expect(normalizeEntityName("日本語")).toBe("日本語");
  });

  it("handles scoped npm packages", () => {
    expect(normalizeEntityName("@scope/my_package")).toBe("@scope/my-package");
  });
});

describe("GraphRepository entity normalization (KNOW-402)", () => {
  let ctx: TestContext;
  let graph: GraphRepository;

  beforeEach(() => {
    ctx = createTestDb();
    graph = new GraphRepository(ctx.db);
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("upsert merges entities with underscore vs hyphen variants", () => {
    const id1 = graph.upsertEntity({
      name: "voicevox_core",
      entityType: "technology",
      createdAt: new Date().toISOString(),
    });
    const id2 = graph.upsertEntity({
      name: "voicevox-core",
      entityType: "technology",
      createdAt: new Date().toISOString(),
    });
    expect(id1).toBe(id2);
  });

  it("getEntityByName finds entity regardless of separator variant", () => {
    graph.upsertEntity({
      name: "react_native",
      entityType: "technology",
      createdAt: new Date().toISOString(),
    });
    const found = graph.getEntityByName("react-native", "technology");
    expect(found).toBeDefined();
    expect(found!.name).toBe("react_native");
  });

  it("different entity types remain separate even with same normalized name", () => {
    const id1 = graph.upsertEntity({
      name: "docker",
      entityType: "technology",
      createdAt: new Date().toISOString(),
    });
    const id2 = graph.upsertEntity({
      name: "docker",
      entityType: "tool",
      createdAt: new Date().toISOString(),
    });
    expect(id1).not.toBe(id2);
  });
});
