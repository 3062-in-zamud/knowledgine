import type { SupportedLocale } from "./types.js";
export type { SupportedLocale } from "./types.js";
export { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./types.js";

// English imports
import { SKILL_MD as CAPTURE_MD } from "./knowledgine-capture/skill-md.js";
import { REFERENCES as CAPTURE_REFS } from "./knowledgine-capture/references.js";
import { SKILL_MD as SEARCH_MD } from "./knowledgine-search/skill-md.js";
import { REFERENCES as SEARCH_REFS } from "./knowledgine-search/references.js";
import { SKILL_MD as EXPLORE_MD } from "./knowledgine-explore/skill-md.js";
import { REFERENCES as EXPLORE_REFS } from "./knowledgine-explore/references.js";
import { SKILL_MD as DEBRIEF_MD } from "./knowledgine-debrief/skill-md.js";
import { REFERENCES as DEBRIEF_REFS } from "./knowledgine-debrief/references.js";
import { SKILL_MD as INGEST_MD } from "./knowledgine-ingest/skill-md.js";
import { REFERENCES as INGEST_REFS } from "./knowledgine-ingest/references.js";
import { SKILL_MD as FEEDBACK_MD } from "./knowledgine-feedback/skill-md.js";
import { REFERENCES as FEEDBACK_REFS } from "./knowledgine-feedback/references.js";
import { SKILL_MD as MEMORY_MD } from "./knowledgine-memory/skill-md.js";
import { REFERENCES as MEMORY_REFS } from "./knowledgine-memory/references.js";

// Japanese imports
import { SKILL_MD as CAPTURE_MD_JA } from "./knowledgine-capture/skill-md.ja.js";
import { REFERENCES as CAPTURE_REFS_JA } from "./knowledgine-capture/references.ja.js";
import { SKILL_MD as SEARCH_MD_JA } from "./knowledgine-search/skill-md.ja.js";
import { REFERENCES as SEARCH_REFS_JA } from "./knowledgine-search/references.ja.js";
import { SKILL_MD as EXPLORE_MD_JA } from "./knowledgine-explore/skill-md.ja.js";
import { REFERENCES as EXPLORE_REFS_JA } from "./knowledgine-explore/references.ja.js";
import { SKILL_MD as DEBRIEF_MD_JA } from "./knowledgine-debrief/skill-md.ja.js";
import { REFERENCES as DEBRIEF_REFS_JA } from "./knowledgine-debrief/references.ja.js";
import { SKILL_MD as INGEST_MD_JA } from "./knowledgine-ingest/skill-md.ja.js";
import { REFERENCES as INGEST_REFS_JA } from "./knowledgine-ingest/references.ja.js";
import { SKILL_MD as FEEDBACK_MD_JA } from "./knowledgine-feedback/skill-md.ja.js";
import { REFERENCES as FEEDBACK_REFS_JA } from "./knowledgine-feedback/references.ja.js";
import { SKILL_MD as MEMORY_MD_JA } from "./knowledgine-memory/skill-md.ja.js";
import { REFERENCES as MEMORY_REFS_JA } from "./knowledgine-memory/references.ja.js";

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
  "knowledgine-search",
  "knowledgine-explore",
  "knowledgine-debrief",
  "knowledgine-ingest",
  "knowledgine-feedback",
  "knowledgine-memory",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

const SKILL_TEMPLATES: Record<SupportedLocale, Record<SkillName, SkillTemplate>> = {
  en: {
    "knowledgine-capture": { skillMd: CAPTURE_MD, references: CAPTURE_REFS },
    "knowledgine-search": { skillMd: SEARCH_MD, references: SEARCH_REFS },
    "knowledgine-explore": { skillMd: EXPLORE_MD, references: EXPLORE_REFS },
    "knowledgine-debrief": { skillMd: DEBRIEF_MD, references: DEBRIEF_REFS },
    "knowledgine-ingest": { skillMd: INGEST_MD, references: INGEST_REFS },
    "knowledgine-feedback": { skillMd: FEEDBACK_MD, references: FEEDBACK_REFS },
    "knowledgine-memory": { skillMd: MEMORY_MD, references: MEMORY_REFS },
  },
  ja: {
    "knowledgine-capture": { skillMd: CAPTURE_MD_JA, references: CAPTURE_REFS_JA },
    "knowledgine-search": { skillMd: SEARCH_MD_JA, references: SEARCH_REFS_JA },
    "knowledgine-explore": { skillMd: EXPLORE_MD_JA, references: EXPLORE_REFS_JA },
    "knowledgine-debrief": { skillMd: DEBRIEF_MD_JA, references: DEBRIEF_REFS_JA },
    "knowledgine-ingest": { skillMd: INGEST_MD_JA, references: INGEST_REFS_JA },
    "knowledgine-feedback": { skillMd: FEEDBACK_MD_JA, references: FEEDBACK_REFS_JA },
    "knowledgine-memory": { skillMd: MEMORY_MD_JA, references: MEMORY_REFS_JA },
  },
};

/**
 * Returns the template for a single skill by name and locale.
 *
 * @throws {Error} If the skill name is not recognized.
 */
export function getSkillTemplate(name: SkillName, locale: SupportedLocale = "en"): SkillTemplate {
  const localeTemplates = SKILL_TEMPLATES[locale];
  if (!localeTemplates) {
    throw new Error(`Unsupported locale: ${locale}. Available: en, ja`);
  }
  const template = localeTemplates[name];
  if (!template) {
    throw new Error(`Unknown skill: ${name}. Available skills: ${SKILL_NAMES.join(", ")}`);
  }
  return template;
}

/**
 * Returns all skill templates for a given locale as a record keyed by skill name.
 */
export function getAllSkillTemplates(
  locale: SupportedLocale = "en",
): Record<SkillName, SkillTemplate> {
  return { ...SKILL_TEMPLATES[locale] };
}
