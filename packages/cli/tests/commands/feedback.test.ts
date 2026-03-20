import { describe, it, expect } from "vitest";
import {
  feedbackListCommand,
  feedbackApplyCommand,
  feedbackDismissCommand,
  feedbackStatsCommand,
} from "../../src/commands/feedback.js";

describe("feedback commands", () => {
  it("should export feedbackListCommand function", () => {
    expect(typeof feedbackListCommand).toBe("function");
  });

  it("should export feedbackApplyCommand function", () => {
    expect(typeof feedbackApplyCommand).toBe("function");
  });

  it("should export feedbackDismissCommand function", () => {
    expect(typeof feedbackDismissCommand).toBe("function");
  });

  it("should export feedbackStatsCommand function", () => {
    expect(typeof feedbackStatsCommand).toBe("function");
  });
});
