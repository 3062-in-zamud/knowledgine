#!/usr/bin/env node
/**
 * check-kpi-thresholds.ts
 *
 * Fetches live KPI data from the npm and GitHub APIs, compares them against
 * the thresholds defined in .github/kpi-thresholds.yml, and opens GitHub
 * Issues for any threshold that has been violated.
 *
 * Intended to be run as a weekly cron job via .github/workflows/kpi-alert.yml.
 *
 * Required environment variables:
 *   GITHUB_TOKEN  – Personal access token (or GITHUB_TOKEN secret in Actions)
 *                   with "repo" scope for creating issues.
 *
 * Optional environment variables:
 *   DRY_RUN=1     – Print what would happen without creating issues.
 *   VERBOSE=1     – Print all KPI values even when thresholds are met.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Minimal YAML parser for the simple flat structure of kpi-thresholds.yml.
// We avoid a runtime dependency on a YAML library.
// ---------------------------------------------------------------------------

interface ThresholdConfig {
  enabled?: boolean;
  min?: number;
  max?: number;
  package?: string;
  repo?: string;
  label?: string;
}

interface ThresholdsFile {
  thresholds: Record<string, ThresholdConfig>;
}

/**
 * Parse the subset of YAML used in kpi-thresholds.yml.
 * Supports string values, numbers, and boolean `true`/`false`.
 * Does not handle arrays or nested maps beyond one level.
 */
function parseSimpleYaml(text: string): ThresholdsFile {
  const result: ThresholdsFile = { thresholds: {} };
  let currentSection: string | null = null;
  let currentKey: string | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, ""); // strip comments
    if (!line.trim()) continue;

    // Top-level key (no indentation)
    const topMatch = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (topMatch) {
      const [, key, value] = topMatch;
      if (key === "thresholds" && !value?.trim()) {
        currentSection = "thresholds";
      }
      continue;
    }

    if (currentSection !== "thresholds") continue;

    // Second-level key (2 spaces)
    const sectionKeyMatch = line.match(/^  (\w[\w_]*):\s*(.*)$/);
    if (sectionKeyMatch) {
      const [, key, value] = sectionKeyMatch;
      if (!value?.trim()) {
        // This is a new threshold entry
        currentKey = key!;
        result.thresholds[currentKey] = {};
      }
      continue;
    }

    // Third-level key (4 spaces) — threshold properties
    if (currentKey) {
      const propMatch = line.match(/^    (\w[\w_]*):\s+(.+)$/);
      if (propMatch) {
        const [, propKey, propValue] = propMatch;
        const cfg = result.thresholds[currentKey]!;
        const trimmed = propValue!.trim();
        if (propKey === "enabled") {
          (cfg as Record<string, unknown>)[propKey!] = trimmed === "true";
        } else if (propKey === "min" || propKey === "max") {
          (cfg as Record<string, unknown>)[propKey!] = parseInt(trimmed, 10);
        } else {
          (cfg as Record<string, unknown>)[propKey!] = trimmed.replace(/^["']|["']$/g, "");
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

interface NpmDownloadResponse {
  downloads: number;
  package: string;
}

async function getNpmWeeklyDownloads(packageName: string): Promise<number> {
  const data = await fetchJson<NpmDownloadResponse>(
    `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`,
  );
  return data.downloads ?? 0;
}

interface GitHubRepo {
  stargazers_count: number;
  open_issues_count: number;
}

async function getGitHubRepoStats(
  repo: string,
  token: string,
): Promise<{ stars: number; openIssues: number }> {
  const data = await fetchJson<GitHubRepo>(`https://api.github.com/repos/${repo}`, {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "knowledgine-kpi-check",
  });
  return {
    stars: data.stargazers_count,
    openIssues: data.open_issues_count,
  };
}

interface GitHubIssue {
  number: number;
  created_at: string;
  pull_request?: unknown;
  comments: number;
  updated_at: string;
}

/**
 * Compute the average first-response time (days) for issues opened in the
 * last 30 days. An issue is considered "responded" when it has at least one
 * comment. Issues with no comments are counted using their age as a proxy.
 */
async function getAvgIssueResponseDays(repo: string, token: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const issues = await fetchJson<GitHubIssue[]>(
    `https://api.github.com/repos/${repo}/issues?state=all&since=${since}&per_page=100`,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "knowledgine-kpi-check",
    },
  );

  // Filter out pull requests (GitHub Issues API returns PRs too)
  const realIssues = issues.filter((i) => !i.pull_request);
  if (realIssues.length === 0) return 0;

  const now = Date.now();
  let totalResponseMs = 0;

  for (const issue of realIssues) {
    const createdAt = new Date(issue.created_at).getTime();
    if (issue.comments > 0) {
      // updated_at is a rough proxy for last activity; first-comment time
      // would need the comments API. Use updated_at as an approximation.
      const respondedAt = new Date(issue.updated_at).getTime();
      totalResponseMs += Math.max(0, respondedAt - createdAt);
    } else {
      // No response yet — use current time as "still waiting"
      totalResponseMs += now - createdAt;
    }
  }

  const avgMs = totalResponseMs / realIssues.length;
  return avgMs / (24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// GitHub Issue creation
// ---------------------------------------------------------------------------

async function getExistingAlertIssues(
  repo: string,
  token: string,
): Promise<Set<string>> {
  const issues = await fetchJson<Array<{ title: string; state: string }>>(
    `https://api.github.com/repos/${repo}/issues?labels=kpi-alert&state=open&per_page=100`,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "knowledgine-kpi-check",
    },
  );
  return new Set(issues.map((i) => i.title));
}

async function createGitHubIssue(
  repo: string,
  token: string,
  title: string,
  body: string,
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "knowledgine-kpi-check",
    },
    body: JSON.stringify({ title, body, labels: ["kpi-alert"] }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create issue: HTTP ${response.status} – ${await response.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ViolationReport {
  thresholdKey: string;
  label: string;
  actual: number;
  limit: number;
  direction: "below_min" | "above_max";
  repo?: string;
}

async function main(): Promise<void> {
  const dryRun = process.env["DRY_RUN"] === "1";
  const verbose = process.env["VERBOSE"] === "1";
  const token = process.env["GITHUB_TOKEN"] ?? "";

  if (!token && !dryRun) {
    console.error("Error: GITHUB_TOKEN environment variable is required.");
    console.error("  Set DRY_RUN=1 to run without creating issues.");
    process.exit(1);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const thresholdsPath = join(__dirname, "..", ".github", "kpi-thresholds.yml");

  let thresholdsYaml: string;
  try {
    thresholdsYaml = readFileSync(thresholdsPath, "utf8");
  } catch (error) {
    console.error(`Error: Cannot read thresholds file at ${thresholdsPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const config = parseSimpleYaml(thresholdsYaml);
  const { thresholds } = config;

  console.log("KPI Threshold Check");
  console.log("===================");
  if (dryRun) console.log("[DRY RUN] No issues will be created.\n");

  const violations: ViolationReport[] = [];

  // ---- npm weekly downloads -------------------------------------------------
  const npmCfg = thresholds["npm_weekly_downloads"];
  if (npmCfg?.enabled !== false && npmCfg?.package) {
    try {
      const downloads = await getNpmWeeklyDownloads(npmCfg.package);
      const min = npmCfg.min ?? 0;
      if (verbose || downloads < min) {
        console.log(`npm weekly downloads (${npmCfg.package}): ${downloads} (min: ${min})`);
      }
      if (downloads < min) {
        violations.push({
          thresholdKey: "npm_weekly_downloads",
          label: npmCfg.label ?? `npm weekly downloads < ${min}`,
          actual: downloads,
          limit: min,
          direction: "below_min",
        });
      }
    } catch (error) {
      console.warn(
        `Warning: Could not fetch npm downloads: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ---- GitHub repo metrics --------------------------------------------------
  const starsCfg = thresholds["github_stars"];
  const issuesCfg = thresholds["github_open_issues"];
  const responseTimeCfg = thresholds["issue_response_time_days"];

  // Determine which repos we need to query (deduplicate)
  const reposToQuery = new Set<string>();
  if (starsCfg?.enabled !== false && starsCfg?.repo) reposToQuery.add(starsCfg.repo);
  if (issuesCfg?.enabled !== false && issuesCfg?.repo) reposToQuery.add(issuesCfg.repo);
  if (responseTimeCfg?.enabled !== false && responseTimeCfg?.repo)
    reposToQuery.add(responseTimeCfg.repo);

  for (const repo of reposToQuery) {
    let repoStats: { stars: number; openIssues: number } | null = null;

    try {
      repoStats = await getGitHubRepoStats(repo, token);
    } catch (error) {
      console.warn(
        `Warning: Could not fetch GitHub repo stats for ${repo}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (repoStats) {
      // Stars
      if (starsCfg?.enabled !== false && starsCfg?.repo === repo) {
        const min = starsCfg.min ?? 0;
        if (verbose || repoStats.stars < min) {
          console.log(`GitHub stars (${repo}): ${repoStats.stars} (min: ${min})`);
        }
        if (repoStats.stars < min) {
          violations.push({
            thresholdKey: "github_stars",
            label: starsCfg.label ?? `GitHub stars < ${min}`,
            actual: repoStats.stars,
            limit: min,
            direction: "below_min",
            repo,
          });
        }
      }

      // Open issues
      if (issuesCfg?.enabled !== false && issuesCfg?.repo === repo) {
        const max = issuesCfg.max ?? Infinity;
        if (verbose || repoStats.openIssues > max) {
          console.log(`Open issues (${repo}): ${repoStats.openIssues} (max: ${max})`);
        }
        if (repoStats.openIssues > max) {
          violations.push({
            thresholdKey: "github_open_issues",
            label: issuesCfg.label ?? `open issues > ${max}`,
            actual: repoStats.openIssues,
            limit: max,
            direction: "above_max",
            repo,
          });
        }
      }
    }

    // Issue response time (separate API call)
    if (responseTimeCfg?.enabled !== false && responseTimeCfg?.repo === repo) {
      try {
        const avgDays = await getAvgIssueResponseDays(repo, token);
        const max = responseTimeCfg.max ?? 7;
        if (verbose || avgDays > max) {
          console.log(
            `Avg issue response time (${repo}): ${avgDays.toFixed(1)} days (max: ${max})`,
          );
        }
        if (avgDays > max) {
          violations.push({
            thresholdKey: "issue_response_time_days",
            label: responseTimeCfg.label ?? `avg issue response > ${max} days`,
            actual: Math.round(avgDays * 10) / 10,
            limit: max,
            direction: "above_max",
            repo,
          });
        }
      } catch (error) {
        console.warn(
          `Warning: Could not compute issue response time: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // ---- Report results -------------------------------------------------------
  console.log(`\nViolations found: ${violations.length}`);

  if (violations.length === 0) {
    console.log("All KPI thresholds are within acceptable limits.");
    return;
  }

  for (const v of violations) {
    const direction = v.direction === "below_min" ? "below minimum" : "above maximum";
    console.log(`  [!] ${v.label}: actual=${v.actual}, ${direction}=${v.limit}`);
  }

  // ---- Create GitHub issues -------------------------------------------------
  // Use the repo from the first violation that has one, or fall back to the
  // first configured repo.
  const targetRepo =
    violations.find((v) => v.repo)?.repo ??
    (Object.values(thresholds).find((t) => t.repo) as ThresholdConfig | undefined)?.repo;

  if (!targetRepo) {
    console.error("Error: No repo configured in thresholds — cannot create issues.");
    process.exit(1);
  }

  let existingTitles: Set<string> = new Set();
  if (!dryRun) {
    try {
      existingTitles = await getExistingAlertIssues(targetRepo, token);
    } catch (error) {
      console.warn(
        `Warning: Could not fetch existing issues: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const v of violations) {
    const title = `[KPI Alert] ${v.label}`;

    if (existingTitles.has(title)) {
      console.log(`  Skipping duplicate issue: "${title}"`);
      continue;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const direction = v.direction === "below_min" ? "minimum" : "maximum";
    const body = [
      `## KPI Threshold Violated: ${v.label}`,
      "",
      `**Detected on**: ${dateStr}`,
      `**Metric**: \`${v.thresholdKey}\``,
      `**Actual value**: ${v.actual}`,
      `**Threshold (${direction})**: ${v.limit}`,
      "",
      "## Action Required",
      "",
      "Please review the current project status and decide whether to:",
      "1. Investigate and address the root cause",
      "2. Adjust the threshold if the metric definition has changed",
      "3. Initiate the project shutdown process (撤退基準) if applicable",
      "",
      "---",
      "_This issue was automatically created by the KPI alert workflow._",
    ].join("\n");

    if (dryRun) {
      console.log(`\n[DRY RUN] Would create issue: "${title}"`);
      console.log(body);
    } else {
      try {
        await createGitHubIssue(targetRepo, token, title, body);
        console.log(`  Created issue: "${title}"`);
      } catch (error) {
        console.error(
          `  Error creating issue "${title}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // Exit with non-zero code so CI can detect threshold violations
  process.exit(1);
}

main().catch((error) => {
  console.error("Unhandled error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
