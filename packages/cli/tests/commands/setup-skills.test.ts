import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeSkills, SKILL_TARGETS } from "../../src/commands/setup-skills.js";
import {
  SKILL_NAMES,
  getSkillTemplate,
  SUPPORTED_LOCALES,
} from "../../src/templates/skills/index.js";

describe("writeSkills", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-skills-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const claudeCodeTarget = SKILL_TARGETS.find((t) => t.value === "claude-code")!;

  describe("write all skills", () => {
    it("creates 7 skill directories with SKILL.md and references/", () => {
      const result = writeSkills(claudeCodeTarget, testDir, [...SKILL_NAMES], {});

      expect(result.status).toBe("ok");
      expect(result.skillCount).toBe(7);

      const skillDir = claudeCodeTarget.getSkillDir(testDir);
      for (const name of SKILL_NAMES) {
        const skillNameDir = join(skillDir, name);
        expect(existsSync(skillNameDir)).toBe(true);
        expect(existsSync(join(skillNameDir, "SKILL.md"))).toBe(true);
        expect(existsSync(join(skillNameDir, "references"))).toBe(true);
      }
    });
  });

  describe("write selected skills", () => {
    it("creates only specified skills", () => {
      const selected = [SKILL_NAMES[0], SKILL_NAMES[1]] as const;
      const result = writeSkills(claudeCodeTarget, testDir, [...selected], {});

      expect(result.status).toBe("ok");
      expect(result.skillCount).toBe(2);

      const skillDir = claudeCodeTarget.getSkillDir(testDir);

      // Only selected skills should exist
      expect(existsSync(join(skillDir, selected[0]))).toBe(true);
      expect(existsSync(join(skillDir, selected[1]))).toBe(true);

      // Other skills should NOT exist
      for (const name of SKILL_NAMES.slice(2)) {
        expect(existsSync(join(skillDir, name))).toBe(false);
      }
    });
  });

  describe("directory structure", () => {
    it("verifies SKILL.md, references/ dir, and reference files exist", () => {
      const skillName = SKILL_NAMES[0];
      const result = writeSkills(claudeCodeTarget, testDir, [skillName], {});

      expect(result.status).toBe("ok");

      const skillDir = claudeCodeTarget.getSkillDir(testDir);
      const skillNameDir = join(skillDir, skillName);
      const refsDir = join(skillNameDir, "references");

      expect(existsSync(join(skillNameDir, "SKILL.md"))).toBe(true);
      expect(existsSync(refsDir)).toBe(true);

      // Verify reference files match template
      const template = getSkillTemplate(skillName);
      for (const filename of Object.keys(template.references)) {
        expect(existsSync(join(refsDir, filename))).toBe(true);
      }
    });
  });

  describe("dryRun mode", () => {
    it("no files are written", () => {
      const result = writeSkills(claudeCodeTarget, testDir, [...SKILL_NAMES], { dryRun: true });

      expect(result.status).toBe("ok");
      expect(result.skillCount).toBe(SKILL_NAMES.length);
      expect(result.note).toContain("dry-run");

      const skillDir = claudeCodeTarget.getSkillDir(testDir);
      expect(existsSync(skillDir)).toBe(false);
    });
  });

  describe("force flag", () => {
    it("overwrites existing skills when force is true", () => {
      // Write skills first
      writeSkills(claudeCodeTarget, testDir, [...SKILL_NAMES], {});

      // Modify a file to confirm overwrite
      const skillDir = claudeCodeTarget.getSkillDir(testDir);
      const firstSkillMd = join(skillDir, SKILL_NAMES[0], "SKILL.md");
      const modifiedContent = "MODIFIED CONTENT";
      writeFileSync(firstSkillMd, modifiedContent, "utf-8");

      // Re-run with force
      const result = writeSkills(claudeCodeTarget, testDir, [...SKILL_NAMES], { force: true });

      expect(result.status).toBe("ok");

      // File should be restored to template content
      const restored = readFileSync(firstSkillMd, "utf-8");
      expect(restored).not.toBe(modifiedContent);
    });

    it("skips without force when skill directory already exists", () => {
      // Create the skill dir to simulate already installed
      writeSkills(claudeCodeTarget, testDir, [...SKILL_NAMES], {});

      const result = writeSkills(claudeCodeTarget, testDir, [...SKILL_NAMES], { force: false });

      expect(result.status).toBe("skipped");
      expect(result.skillCount).toBe(0);
      expect(result.note).toContain("--force");
    });
  });

  describe("skill content", () => {
    it("SKILL.md contains valid frontmatter (name, description)", () => {
      writeSkills(claudeCodeTarget, testDir, [...SKILL_NAMES], {});

      const skillDir = claudeCodeTarget.getSkillDir(testDir);

      for (const name of SKILL_NAMES) {
        const skillMdPath = join(skillDir, name, "SKILL.md");
        const content = readFileSync(skillMdPath, "utf-8");

        // Should have YAML frontmatter block
        expect(content).toMatch(/^---\n/);
        // Should contain name or title field
        expect(content).toMatch(/(?:name|title):/);
        // Should contain some description-like content
        expect(content.length).toBeGreaterThan(100);
      }
    });
  });

  describe("SKILL_TARGETS metadata", () => {
    it("shared dir dedup: github-copilot and vscode share copilot-skills", () => {
      const githubCopilot = SKILL_TARGETS.find((t) => t.value === "github-copilot");
      const vscode = SKILL_TARGETS.find((t) => t.value === "vscode");

      expect(githubCopilot?.sharedDir).toBe("copilot-skills");
      expect(vscode?.sharedDir).toBe("copilot-skills");
    });

    it("shared dir dedup: gemini and antigravity share gemini-skills", () => {
      const gemini = SKILL_TARGETS.find((t) => t.value === "gemini");
      const antigravity = SKILL_TARGETS.find((t) => t.value === "antigravity");

      expect(gemini?.sharedDir).toBe("gemini-skills");
      expect(antigravity?.sharedDir).toBe("gemini-skills");
    });

    it("unsupported target: continue has supported: false", () => {
      const continueTarget = SKILL_TARGETS.find((t) => t.value === "continue");

      expect(continueTarget).toBeDefined();
      expect(continueTarget?.supported).toBe(false);
    });

    it("unsupported target: zed has supported: false", () => {
      const zed = SKILL_TARGETS.find((t) => t.value === "zed");

      expect(zed).toBeDefined();
      expect(zed?.supported).toBe(false);
    });

    it("unsupported target: claude-desktop has supported: false", () => {
      const claudeDesktop = SKILL_TARGETS.find((t) => t.value === "claude-desktop");

      expect(claudeDesktop).toBeDefined();
      expect(claudeDesktop?.supported).toBe(false);
    });
  });

  describe("SKILL_NAMES", () => {
    it("all SKILL_NAMES available: 7 skills defined", () => {
      expect(SKILL_NAMES).toHaveLength(7);
      expect(SKILL_NAMES).toContain("knowledgine-capture");
      expect(SKILL_NAMES).toContain("knowledgine-search");
      expect(SKILL_NAMES).toContain("knowledgine-explore");
      expect(SKILL_NAMES).toContain("knowledgine-debrief");
      expect(SKILL_NAMES).toContain("knowledgine-ingest");
      expect(SKILL_NAMES).toContain("knowledgine-feedback");
      expect(SKILL_NAMES).toContain("knowledgine-memory");
    });
  });

  describe("locale support", () => {
    it("getSkillTemplate defaults to English", () => {
      const defaultTemplate = getSkillTemplate("knowledgine-capture");
      const enTemplate = getSkillTemplate("knowledgine-capture", "en");
      expect(defaultTemplate.skillMd).toBe(enTemplate.skillMd);
    });

    it("getSkillTemplate returns different content for en and ja", () => {
      const en = getSkillTemplate("knowledgine-capture", "en");
      const ja = getSkillTemplate("knowledgine-capture", "ja");
      expect(en.skillMd).not.toBe(ja.skillMd);
      expect(Object.keys(en.references).sort()).toEqual(Object.keys(ja.references).sort());
    });

    it("Japanese content contains Japanese characters", () => {
      const ja = getSkillTemplate("knowledgine-capture", "ja");
      expect(ja.skillMd).toMatch(/[\u3000-\u9FFF]/);
    });

    it("all skills have both en and ja templates", () => {
      for (const name of SKILL_NAMES) {
        for (const locale of SUPPORTED_LOCALES) {
          const template = getSkillTemplate(name, locale);
          expect(template.skillMd).toBeTruthy();
          expect(Object.keys(template.references).length).toBeGreaterThan(0);
        }
      }
    });

    it("writeSkills with locale ja writes Japanese content", () => {
      const result = writeSkills(claudeCodeTarget, testDir, ["knowledgine-capture"], {
        force: true,
        locale: "ja",
      });
      expect(result.status).toBe("ok");
      const skillDir = claudeCodeTarget.getSkillDir(testDir);
      const content = readFileSync(join(skillDir, "knowledgine-capture", "SKILL.md"), "utf-8");
      expect(content).toMatch(/[\u3000-\u9FFF]/);
    });
  });
});
