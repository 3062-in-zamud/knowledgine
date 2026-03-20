import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { FeedbackRepository } from "../../src/feedback/feedback-repository.js";
import { FeedbackLearner } from "../../src/feedback/feedback-learner.js";
import type { ExtractionRules } from "../../src/feedback/feedback-learner.js";

describe("FeedbackLearner", () => {
  let ctx: TestContext;
  let repo: FeedbackRepository;
  let learner: FeedbackLearner;
  let testDir: string;
  let rulesPath: string;

  beforeEach(() => {
    ctx = createTestDb();
    repo = new FeedbackRepository(ctx.db);
    testDir = join(tmpdir(), `knowledgine-feedback-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    rulesPath = join(testDir, "extraction-rules.json");
    learner = new FeedbackLearner(repo, rulesPath);
  });

  afterEach(() => {
    ctx.db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("applyFeedback — false_positive", () => {
    it("should add entity to blacklist", () => {
      const feedback = repo.create({
        entityName: "usestate",
        errorType: "false_positive",
      });
      learner.applyFeedback(feedback.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      expect(rules.entityBlacklist).toContain("usestate");
      expect(rules.version).toBe(1);
      expect(rules.updatedAt).toBeTruthy();

      // Feedback status should be updated
      const updated = repo.getById(feedback.id);
      expect(updated!.status).toBe("applied");
    });

    it("should not duplicate blacklist entries", () => {
      const f1 = repo.create({ entityName: "noise", errorType: "false_positive" });
      learner.applyFeedback(f1.id);

      const f2 = repo.create({ entityName: "noise", errorType: "false_positive" });
      learner.applyFeedback(f2.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      const count = rules.entityBlacklist.filter((e) => e === "noise").length;
      expect(count).toBe(1);
    });
  });

  describe("applyFeedback — wrong_type", () => {
    it("should add type override", () => {
      const feedback = repo.create({
        entityName: "typescript",
        errorType: "wrong_type",
        entityType: "tool",
        correctType: "technology",
      });
      learner.applyFeedback(feedback.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      expect(rules.typeOverrides).toHaveLength(1);
      expect(rules.typeOverrides[0]).toEqual({
        name: "typescript",
        fromType: "tool",
        toType: "technology",
      });
    });

    it("should throw when entityType is missing", () => {
      const feedback = repo.create({
        entityName: "typescript",
        errorType: "wrong_type",
        correctType: "technology",
      });
      expect(() => learner.applyFeedback(feedback.id)).toThrow(
        "wrong_type feedback requires both entityType and correctType",
      );
    });

    it("should throw when correctType is missing", () => {
      const feedback = repo.create({
        entityName: "typescript",
        errorType: "wrong_type",
        entityType: "tool",
      });
      expect(() => learner.applyFeedback(feedback.id)).toThrow(
        "wrong_type feedback requires both entityType and correctType",
      );
    });

    it("should update existing override for same entity", () => {
      const f1 = repo.create({
        entityName: "vitest",
        errorType: "wrong_type",
        entityType: "concept",
        correctType: "tool",
      });
      learner.applyFeedback(f1.id);

      const f2 = repo.create({
        entityName: "vitest",
        errorType: "wrong_type",
        entityType: "tool",
        correctType: "technology",
      });
      learner.applyFeedback(f2.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      const overrides = rules.typeOverrides.filter((o) => o.name === "vitest");
      expect(overrides).toHaveLength(1);
      expect(overrides[0].toType).toBe("technology");
    });
  });

  describe("applyFeedback — missed_entity", () => {
    it("should add entity to whitelist", () => {
      const feedback = repo.create({
        entityName: "vitest",
        errorType: "missed_entity",
        correctType: "technology",
      });
      learner.applyFeedback(feedback.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      expect(rules.entityWhitelist).toHaveLength(1);
      expect(rules.entityWhitelist[0]).toEqual({
        name: "vitest",
        type: "technology",
      });
    });

    it("should use entityType as fallback when correctType is not set", () => {
      const feedback = repo.create({
        entityName: "pnpm",
        errorType: "missed_entity",
        entityType: "tool",
      });
      learner.applyFeedback(feedback.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      expect(rules.entityWhitelist[0].type).toBe("tool");
    });

    it("should default to technology when no type provided", () => {
      const feedback = repo.create({
        entityName: "pnpm",
        errorType: "missed_entity",
      });
      learner.applyFeedback(feedback.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      expect(rules.entityWhitelist[0].type).toBe("technology");
    });

    it("should update existing whitelist entry for same entity", () => {
      const f1 = repo.create({
        entityName: "deno",
        errorType: "missed_entity",
        correctType: "tool",
      });
      learner.applyFeedback(f1.id);

      const f2 = repo.create({
        entityName: "deno",
        errorType: "missed_entity",
        correctType: "technology",
      });
      learner.applyFeedback(f2.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      const entries = rules.entityWhitelist.filter((w) => w.name === "deno");
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("technology");
    });
  });

  describe("merge with existing rules", () => {
    it("should preserve existing rules when adding new ones", () => {
      const existingRules: ExtractionRules = {
        version: 1,
        updatedAt: "2024-01-01T00:00:00Z",
        stopWords: { added: ["noise"] },
        typeOverrides: [{ name: "old", fromType: "a", toType: "b" }],
        entityBlacklist: ["existing-blacklist"],
        entityWhitelist: [{ name: "existing-whitelist", type: "tool" }],
      };
      writeFileSync(rulesPath, JSON.stringify(existingRules));

      const feedback = repo.create({
        entityName: "new-blacklist",
        errorType: "false_positive",
      });
      learner.applyFeedback(feedback.id);

      const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as ExtractionRules;
      expect(rules.entityBlacklist).toContain("existing-blacklist");
      expect(rules.entityBlacklist).toContain("new-blacklist");
      expect(rules.typeOverrides).toHaveLength(1);
      expect(rules.entityWhitelist).toHaveLength(1);
      expect(rules.stopWords.added).toEqual(["noise"]);
    });
  });

  describe("error handling", () => {
    it("should throw for non-existent feedback ID", () => {
      expect(() => learner.applyFeedback(999)).toThrow("Feedback record not found");
    });
  });

  describe("atomic write", () => {
    it("should write rules file atomically", () => {
      const feedback = repo.create({
        entityName: "test",
        errorType: "false_positive",
      });
      learner.applyFeedback(feedback.id);

      // File should exist and be valid JSON
      const content = readFileSync(rulesPath, "utf-8");
      const rules = JSON.parse(content);
      expect(rules.entityBlacklist).toContain("test");
    });
  });
});
