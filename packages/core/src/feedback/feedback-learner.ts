import { readFileSync, writeFileSync, renameSync } from "fs";
import { join, dirname } from "path";
import { FeedbackRepository } from "./feedback-repository.js";

export interface TypeOverride {
  name: string;
  fromType: string;
  toType: string;
}

export interface WhitelistEntry {
  name: string;
  type: string;
}

export interface ExtractionRules {
  version: number;
  updatedAt: string;
  stopWords: { added: string[] };
  typeOverrides: TypeOverride[];
  entityBlacklist: string[];
  entityWhitelist: WhitelistEntry[];
}

function createEmptyRules(): ExtractionRules {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    stopWords: { added: [] },
    typeOverrides: [],
    entityBlacklist: [],
    entityWhitelist: [],
  };
}

export class FeedbackLearner {
  constructor(
    private feedbackRepository: FeedbackRepository,
    private rulesPath: string,
  ) {}

  applyFeedback(feedbackId: number): void {
    const feedback = this.feedbackRepository.getById(feedbackId);
    if (!feedback) {
      throw new Error(`Feedback record not found: id=${feedbackId}`);
    }

    const rules = this.loadRules();

    switch (feedback.errorType) {
      case "false_positive":
        if (!rules.entityBlacklist.includes(feedback.entityName)) {
          rules.entityBlacklist.push(feedback.entityName);
        }
        break;

      case "wrong_type":
        if (!feedback.entityType || !feedback.correctType) {
          throw new Error("wrong_type feedback requires both entityType and correctType");
        }
        // Check for existing override for same entity name
        const existingIdx = rules.typeOverrides.findIndex((o) => o.name === feedback.entityName);
        const override: TypeOverride = {
          name: feedback.entityName,
          fromType: feedback.entityType,
          toType: feedback.correctType,
        };
        if (existingIdx >= 0) {
          rules.typeOverrides[existingIdx] = override;
        } else {
          rules.typeOverrides.push(override);
        }
        break;

      case "missed_entity": {
        const entityType = feedback.correctType ?? feedback.entityType ?? "technology";
        // Check for existing whitelist entry for same entity name
        const existingWlIdx = rules.entityWhitelist.findIndex(
          (w) => w.name === feedback.entityName,
        );
        const entry: WhitelistEntry = {
          name: feedback.entityName,
          type: entityType,
        };
        if (existingWlIdx >= 0) {
          rules.entityWhitelist[existingWlIdx] = entry;
        } else {
          rules.entityWhitelist.push(entry);
        }
        break;
      }
    }

    rules.updatedAt = new Date().toISOString();
    this.saveRules(rules);
    this.feedbackRepository.updateStatus(feedbackId, "applied");
  }

  loadRules(): ExtractionRules {
    try {
      const content = readFileSync(this.rulesPath, "utf-8");
      return JSON.parse(content) as ExtractionRules;
    } catch {
      return createEmptyRules();
    }
  }

  private saveRules(rules: ExtractionRules): void {
    const dir = dirname(this.rulesPath);
    const tmpPath = join(dir, `.extraction-rules.tmp.${process.pid}.json`);
    writeFileSync(tmpPath, JSON.stringify(rules, null, 2), "utf-8");
    renameSync(tmpPath, this.rulesPath);
  }
}
