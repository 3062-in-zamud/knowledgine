import { SKILL_MD as CAPTURE_MD } from "./knowledgine-capture/skill-md.js";
import { REFERENCES as CAPTURE_REFS } from "./knowledgine-capture/references.js";
import { SKILL_MD as RECALL_MD } from "./knowledgine-recall/skill-md.js";
import { REFERENCES as RECALL_REFS } from "./knowledgine-recall/references.js";
import { SKILL_MD as SUGGEST_MD } from "./knowledgine-suggest/skill-md.js";
import { REFERENCES as SUGGEST_REFS } from "./knowledgine-suggest/references.js";
import { SKILL_MD as EXPLAIN_MD } from "./knowledgine-explain/skill-md.js";
import { REFERENCES as EXPLAIN_REFS } from "./knowledgine-explain/references.js";
import { SKILL_MD as DEBRIEF_MD } from "./knowledgine-debrief/skill-md.js";
import { REFERENCES as DEBRIEF_REFS } from "./knowledgine-debrief/references.js";
import { SKILL_MD as INGEST_MD } from "./knowledgine-ingest/skill-md.js";
import { REFERENCES as INGEST_REFS } from "./knowledgine-ingest/references.js";
import { SKILL_MD as FEEDBACK_MD } from "./knowledgine-feedback/skill-md.js";
import { REFERENCES as FEEDBACK_REFS } from "./knowledgine-feedback/references.js";

/**
 * A skill template contains the SKILL.md content and any reference files
 * that should be written alongside it.
 */
export interface SkillTemplate {
  /** Content of the SKILL.md file */
  skillMd: string;
  /** Map of filename → content for reference files placed in a references/ subdirectory */
  references: Record<string, string>;
}

/**
 * All available skill names.
 */
export const SKILL_NAMES = [
  "knowledgine-capture",
  "knowledgine-recall",
  "knowledgine-suggest",
  "knowledgine-explain",
  "knowledgine-debrief",
  "knowledgine-ingest",
  "knowledgine-feedback",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

const SKILL_TEMPLATES: Record<SkillName, SkillTemplate> = {
  "knowledgine-capture": {
    skillMd: CAPTURE_MD,
    references: CAPTURE_REFS,
  },
  "knowledgine-recall": {
    skillMd: RECALL_MD,
    references: RECALL_REFS,
  },
  "knowledgine-suggest": {
    skillMd: SUGGEST_MD,
    references: SUGGEST_REFS,
  },
  "knowledgine-explain": {
    skillMd: EXPLAIN_MD,
    references: EXPLAIN_REFS,
  },
  "knowledgine-debrief": {
    skillMd: DEBRIEF_MD,
    references: DEBRIEF_REFS,
  },
  "knowledgine-ingest": {
    skillMd: INGEST_MD,
    references: INGEST_REFS,
  },
  "knowledgine-feedback": {
    skillMd: FEEDBACK_MD,
    references: FEEDBACK_REFS,
  },
};

/**
 * Returns the template for a single skill by name.
 *
 * @throws {Error} If the skill name is not recognized.
 */
export function getSkillTemplate(name: SkillName): SkillTemplate {
  const template = SKILL_TEMPLATES[name];
  if (!template) {
    throw new Error(`Unknown skill: ${name}. Available skills: ${SKILL_NAMES.join(", ")}`);
  }
  return template;
}

/**
 * Returns all skill templates as a record keyed by skill name.
 */
export function getAllSkillTemplates(): Record<SkillName, SkillTemplate> {
  return { ...SKILL_TEMPLATES };
}
