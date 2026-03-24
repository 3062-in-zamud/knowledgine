import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeRuleFile, RULE_TARGETS } from "../../src/commands/setup-rules.js";

describe("writeRuleFile", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-rules-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("append-section strategy", () => {
    const claudeCodeTarget = RULE_TARGETS.find((t) => t.value === "claude-code")!;

    it("new file: creates file with template content", () => {
      const result = writeRuleFile(claudeCodeTarget, testDir, {});

      expect(result.status).toBe("ok");
      expect(result.target).toBe("Claude Code");

      const filePath = claudeCodeTarget.getRulePath(testDir);
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf-8");
      const template = claudeCodeTarget.getTemplate(testDir);
      expect(content).toContain(template.slice(0, 50));
    });

    it("existing file without markers: appends template to end of content", () => {
      const filePath = claudeCodeTarget.getRulePath(testDir);
      const existingContent = "# My Project\n\nSome existing rules here.";
      writeFileSync(filePath, existingContent, "utf-8");

      const result = writeRuleFile(claudeCodeTarget, testDir, {});

      expect(result.status).toBe("ok");

      const written = readFileSync(filePath, "utf-8");
      expect(written).toContain("My Project");
      expect(written).toContain("Some existing rules here");
      // Template content should be appended after the existing content
      const template = claudeCodeTarget.getTemplate(testDir);
      expect(written).toContain(template.slice(0, 50));
    });

    it("existing file with markers: replaces content between markers", () => {
      const filePath = claudeCodeTarget.getRulePath(testDir);
      const markerStart = "<!-- knowledgine:rules:start -->";
      const markerEnd = "<!-- knowledgine:rules:end -->";
      const existingContent = `# My Project\n\n${markerStart}\nOLD CONTENT\n${markerEnd}\n\nMore content below.`;
      writeFileSync(filePath, existingContent, "utf-8");

      const result = writeRuleFile(claudeCodeTarget, testDir, {});

      expect(result.status).toBe("ok");

      const written = readFileSync(filePath, "utf-8");
      expect(written).not.toContain("OLD CONTENT");
      expect(written).toContain("# My Project");
      expect(written).toContain("More content below.");
      // New template content should be between the original marker positions
      const template = claudeCodeTarget.getTemplate(testDir);
      expect(written).toContain(template.slice(0, 50));
    });

    it("backup creation: creates .bak file when overwriting existing file", () => {
      const filePath = claudeCodeTarget.getRulePath(testDir);
      const existingContent = "# Existing content";
      writeFileSync(filePath, existingContent, "utf-8");

      writeRuleFile(claudeCodeTarget, testDir, {});

      const bakPath = filePath + ".bak";
      expect(existsSync(bakPath)).toBe(true);
      const bakContent = readFileSync(bakPath, "utf-8");
      expect(bakContent).toBe(existingContent);
    });
  });

  describe("create-file strategy", () => {
    const cursorTarget = RULE_TARGETS.find((t) => t.value === "cursor")!;

    it("new file: creates file and parent directories", () => {
      const result = writeRuleFile(cursorTarget, testDir, {});

      expect(result.status).toBe("ok");
      expect(result.target).toBe("Cursor");

      const filePath = cursorTarget.getRulePath(testDir);
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf-8");
      const template = cursorTarget.getTemplate(testDir);
      expect(content).toBe(template);
    });

    it("existing file without force: returns skipped status", () => {
      const filePath = cursorTarget.getRulePath(testDir);
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, "existing content", "utf-8");

      const result = writeRuleFile(cursorTarget, testDir, { force: false });

      expect(result.status).toBe("skipped");
      expect(result.note).toContain("--force");

      // File should remain unchanged
      const content = readFileSync(filePath, "utf-8");
      expect(content).toBe("existing content");
    });

    it("existing file with force: overwrites and creates backup", () => {
      const filePath = cursorTarget.getRulePath(testDir);
      mkdirSync(join(filePath, ".."), { recursive: true });
      const originalContent = "original content";
      writeFileSync(filePath, originalContent, "utf-8");

      const result = writeRuleFile(cursorTarget, testDir, { force: true });

      expect(result.status).toBe("ok");

      // Backup should exist
      const bakPath = filePath + ".bak";
      expect(existsSync(bakPath)).toBe(true);
      const bakContent = readFileSync(bakPath, "utf-8");
      expect(bakContent).toBe(originalContent);

      // File should be overwritten with template
      const newContent = readFileSync(filePath, "utf-8");
      const template = cursorTarget.getTemplate(testDir);
      expect(newContent).toBe(template);
    });
  });

  describe("dryRun mode", () => {
    it("no files are written in dryRun mode (append-section)", () => {
      const claudeCodeTarget = RULE_TARGETS.find((t) => t.value === "claude-code")!;
      const filePath = claudeCodeTarget.getRulePath(testDir);

      const result = writeRuleFile(claudeCodeTarget, testDir, { dryRun: true });

      expect(result.status).toBe("ok");
      expect(existsSync(filePath)).toBe(false);
    });

    it("no files are written in dryRun mode (create-file)", () => {
      const cursorTarget = RULE_TARGETS.find((t) => t.value === "cursor")!;
      const filePath = cursorTarget.getRulePath(testDir);

      const result = writeRuleFile(cursorTarget, testDir, { dryRun: true });

      expect(result.status).toBe("ok");
      expect(existsSync(filePath)).toBe(false);
    });
  });

  describe("RULE_TARGETS metadata", () => {
    it("shared file dedup: codex and opencode share agents-md", () => {
      const codex = RULE_TARGETS.find((t) => t.value === "codex");
      const opencode = RULE_TARGETS.find((t) => t.value === "opencode");
      const antigravity = RULE_TARGETS.find((t) => t.value === "antigravity");

      expect(codex?.sharedFile).toBe("agents-md");
      expect(opencode?.sharedFile).toBe("agents-md");
      expect(antigravity?.sharedFile).toBe("agents-md");
    });

    it("shared file dedup: github-copilot and vscode share copilot-instructions", () => {
      const githubCopilot = RULE_TARGETS.find((t) => t.value === "github-copilot");
      const vscode = RULE_TARGETS.find((t) => t.value === "vscode");

      expect(githubCopilot?.sharedFile).toBe("copilot-instructions");
      expect(vscode?.sharedFile).toBe("copilot-instructions");
    });

    it("unsupported target: claude-desktop has supported: false", () => {
      const claudeDesktop = RULE_TARGETS.find((t) => t.value === "claude-desktop");

      expect(claudeDesktop).toBeDefined();
      expect(claudeDesktop?.supported).toBe(false);
    });
  });
});
