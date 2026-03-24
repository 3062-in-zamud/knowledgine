import type { NormalizedEvent } from "../../types.js";
import { sanitizeContent } from "../../normalizer.js";

export interface GhActionsRun {
  databaseId: number;
  displayTitle: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  workflowName: string;
  headBranch: string;
  event: string;
}

export interface GhActionsRunDetail {
  jobs: Array<{
    name: string;
    conclusion: string;
    steps: Array<{ name: string; conclusion: string; number: number }>;
  }>;
  conclusion: string;
  url: string;
}

export function parseRunList(jsonOutput: string): GhActionsRun[] {
  const data: unknown = JSON.parse(jsonOutput);
  if (!Array.isArray(data)) return [];
  return data.map((item: Record<string, unknown>) => ({
    databaseId: item.databaseId as number,
    displayTitle: (item.displayTitle as string) ?? "",
    status: (item.status as string) ?? "",
    conclusion: (item.conclusion as string | null) ?? null,
    createdAt: (item.createdAt as string) ?? "",
    updatedAt: (item.updatedAt as string) ?? "",
    workflowName: (item.workflowName as string) ?? "",
    headBranch: (item.headBranch as string) ?? "",
    event: (item.event as string) ?? "",
  }));
}

export function parseRunDetail(jsonOutput: string): GhActionsRunDetail {
  const data = JSON.parse(jsonOutput) as GhActionsRunDetail;
  return {
    jobs: (data.jobs ?? []).map((job) => ({
      name: job.name ?? "",
      conclusion: job.conclusion ?? "",
      steps: (job.steps ?? []).map((step) => ({
        name: step.name ?? "",
        conclusion: step.conclusion ?? "",
        number: step.number ?? 0,
      })),
    })),
    conclusion: data.conclusion ?? "",
    url: data.url ?? "",
  };
}

export function extractFailureInfo(detail: GhActionsRunDetail): string {
  const failedParts: string[] = [];

  for (const job of detail.jobs) {
    if (job.conclusion !== "failure") continue;

    const failedSteps = job.steps.filter((step) => step.conclusion === "failure");
    if (failedSteps.length > 0) {
      const stepNames = failedSteps.map((s) => s.name).join(", ");
      failedParts.push(`Job "${job.name}" failed at steps: ${stepNames}`);
    } else {
      failedParts.push(`Job "${job.name}" failed`);
    }
  }

  return failedParts.join("\n");
}

export function runToNormalizedEvent(
  run: GhActionsRun,
  owner: string,
  repo: string,
  failureDetail?: string,
): NormalizedEvent {
  let content = `Workflow: ${run.workflowName}\nBranch: ${run.headBranch}\nEvent: ${run.event}\nStatus: ${run.status}\nConclusion: ${run.conclusion ?? "unknown"}`;

  if (failureDetail) {
    content += `\n\nFailure details:\n${failureDetail}`;
  }

  const sanitized = sanitizeContent(content);

  return {
    sourceUri: `cicd://${owner}/${repo}/runs/${run.databaseId}`,
    eventType: "ci_result",
    title: run.displayTitle,
    content: sanitized,
    timestamp: new Date(run.updatedAt || run.createdAt),
    metadata: {
      sourcePlugin: "cicd",
      sourceId: String(run.databaseId),
      tags: [run.workflowName, run.conclusion ?? "unknown", run.event, run.headBranch],
      extra: {
        conclusion: run.conclusion,
        status: run.status,
        url: `https://github.com/${owner}/${repo}/actions/runs/${run.databaseId}`,
      },
    },
  };
}
