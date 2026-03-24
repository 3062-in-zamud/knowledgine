import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseRunList,
  parseRunDetail,
  runToNormalizedEvent,
  extractFailureInfo,
} from "../../../src/plugins/cicd/gh-actions-parser.js";
import type {
  GhActionsRun,
  GhActionsRunDetail,
} from "../../../src/plugins/cicd/gh-actions-parser.js";

const fixturesDir = join(__dirname, "../../fixtures/cicd");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("parseRunList", () => {
  it("should parse 2 runs from fixture", () => {
    const json = loadFixture("runs.json");
    const runs = parseRunList(json);
    expect(runs).toHaveLength(2);
    expect(runs[0].databaseId).toBe(12345);
    expect(runs[0].displayTitle).toBe("CI - main");
    expect(runs[0].status).toBe("completed");
    expect(runs[0].conclusion).toBe("success");
    expect(runs[0].workflowName).toBe("CI");
    expect(runs[0].headBranch).toBe("main");
    expect(runs[0].event).toBe("push");
    expect(runs[1].databaseId).toBe(12346);
    expect(runs[1].conclusion).toBe("failure");
  });

  it("should return empty array for empty JSON array", () => {
    const json = loadFixture("empty.json");
    const runs = parseRunList(json);
    expect(runs).toHaveLength(0);
  });

  it("should return empty array for non-array JSON", () => {
    const runs = parseRunList('{"not": "array"}');
    expect(runs).toHaveLength(0);
  });

  it("should throw on invalid JSON", () => {
    expect(() => parseRunList("not json")).toThrow();
  });
});

describe("parseRunDetail", () => {
  it("should parse failure detail from fixture", () => {
    const json = loadFixture("run-detail-failure.json");
    const detail = parseRunDetail(json);
    expect(detail.conclusion).toBe("failure");
    expect(detail.url).toBe("https://github.com/owner/repo/actions/runs/12346");
    expect(detail.jobs).toHaveLength(1);
    expect(detail.jobs[0].name).toBe("test");
    expect(detail.jobs[0].conclusion).toBe("failure");
    expect(detail.jobs[0].steps).toHaveLength(3);
  });

  it("should parse step details correctly", () => {
    const json = loadFixture("run-detail-failure.json");
    const detail = parseRunDetail(json);
    const failedStep = detail.jobs[0].steps.find((s) => s.conclusion === "failure");
    expect(failedStep).toBeDefined();
    expect(failedStep!.name).toBe("Run tests");
    expect(failedStep!.number).toBe(3);
  });
});

describe("runToNormalizedEvent", () => {
  const successRun: GhActionsRun = {
    databaseId: 12345,
    displayTitle: "CI - main",
    status: "completed",
    conclusion: "success",
    createdAt: "2026-03-20T10:00:00Z",
    updatedAt: "2026-03-20T10:05:00Z",
    workflowName: "CI",
    headBranch: "main",
    event: "push",
  };

  const failureRun: GhActionsRun = {
    databaseId: 12346,
    displayTitle: "CI - feature/test",
    status: "completed",
    conclusion: "failure",
    createdAt: "2026-03-20T11:00:00Z",
    updatedAt: "2026-03-20T11:10:00Z",
    workflowName: "CI",
    headBranch: "feature/test",
    event: "push",
  };

  it("should produce eventType 'ci_result' for success run", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.eventType).toBe("ci_result");
  });

  it("should produce eventType 'ci_result' for failure run", () => {
    const event = runToNormalizedEvent(failureRun, "owner", "repo");
    expect(event.eventType).toBe("ci_result");
  });

  it("should have sourceUri starting with 'cicd://'", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.sourceUri).toMatch(/^cicd:\/\//);
  });

  it("should produce correct sourceUri", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.sourceUri).toBe("cicd://owner/repo/runs/12345");
  });

  it("should produce correct title", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.title).toBe("CI - main");
  });

  it("should set metadata.extra.conclusion for success run", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.metadata.extra?.conclusion).toBe("success");
  });

  it("should set metadata.sourcePlugin to 'cicd'", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.metadata.sourcePlugin).toBe("cicd");
  });

  it("should set metadata.sourceId to databaseId as string", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.metadata.sourceId).toBe("12345");
  });

  it("should include workflowName and conclusion in metadata.tags", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.metadata.tags).toContain("CI");
    expect(event.metadata.tags).toContain("success");
  });

  it("should include event and headBranch in metadata.tags", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.metadata.tags).toContain("push");
    expect(event.metadata.tags).toContain("main");
  });

  it("should include failure info in content when failureDetail is provided", () => {
    const event = runToNormalizedEvent(failureRun, "owner", "repo", "Failed step: Run tests");
    expect(event.content).toContain("Failed step: Run tests");
  });

  it("should not include failure info in content for success run", () => {
    const event = runToNormalizedEvent(successRun, "owner", "repo");
    expect(event.content).not.toContain("Failed step");
  });
});

describe("extractFailureInfo", () => {
  const sampleDetail: GhActionsRunDetail = {
    jobs: [
      {
        name: "test",
        conclusion: "failure",
        steps: [
          { name: "Checkout", conclusion: "success", number: 1 },
          { name: "Install", conclusion: "success", number: 2 },
          { name: "Run tests", conclusion: "failure", number: 3 },
        ],
      },
    ],
    conclusion: "failure",
    url: "https://github.com/owner/repo/actions/runs/12346",
  };

  it("should extract failed step names", () => {
    const info = extractFailureInfo(sampleDetail);
    expect(info).toContain("Run tests");
  });

  it("should include failed job name", () => {
    const info = extractFailureInfo(sampleDetail);
    expect(info).toContain("test");
  });

  it("should return empty string when no failures", () => {
    const successDetail: GhActionsRunDetail = {
      jobs: [
        {
          name: "build",
          conclusion: "success",
          steps: [{ name: "Build", conclusion: "success", number: 1 }],
        },
      ],
      conclusion: "success",
      url: "https://github.com/owner/repo/actions/runs/12345",
    };
    const info = extractFailureInfo(successDetail);
    expect(info).toBe("");
  });

  it("should handle multiple failed jobs", () => {
    const multiFailDetail: GhActionsRunDetail = {
      jobs: [
        {
          name: "lint",
          conclusion: "failure",
          steps: [{ name: "Run lint", conclusion: "failure", number: 1 }],
        },
        {
          name: "test",
          conclusion: "failure",
          steps: [{ name: "Run tests", conclusion: "failure", number: 1 }],
        },
      ],
      conclusion: "failure",
      url: "https://github.com/owner/repo/actions/runs/12347",
    };
    const info = extractFailureInfo(multiFailDetail);
    expect(info).toContain("lint");
    expect(info).toContain("test");
  });
});
