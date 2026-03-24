import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";

export interface CausalLinkSummary {
  causedLinks: number;
  includedInLinks: number;
  triggeredLinks: number;
  errors: number;
}

const SESSION_TO_COMMIT_THRESHOLD_SECONDS = 1800; // strictly less than
const REVIEW_TO_COMMIT_THRESHOLD_SECONDS = 24 * 60 * 60; // 24 hours

function parseFrontmatter(note: KnowledgeNote): Record<string, unknown> {
  if (!note.frontmatter_json) return {};
  try {
    return JSON.parse(note.frontmatter_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getTimestampSeconds(isoString: string | null | undefined): number | null {
  if (!isoString) return null;
  const ms = Date.parse(isoString);
  if (isNaN(ms)) return null;
  return ms / 1000;
}

function extractCommitShaFromUri(uri: string): string | null {
  // git://commit/<sha> パターンから SHA を抽出
  const match = /git:\/\/commit\/([0-9a-f]+)/i.exec(uri);
  return match ? match[1] : null;
}

function isPrNote(note: KnowledgeNote): boolean {
  // github://repos/... の形式で "reviews" を含まないもの
  return note.file_path.startsWith("github://") && !note.file_path.includes("/reviews/");
}

function isReviewNote(note: KnowledgeNote): boolean {
  return note.file_path.includes("/reviews/");
}

export class CausalLinkDetector {
  constructor(private repository: KnowledgeRepository) {}

  detectAll(): CausalLinkSummary {
    let errors = 0;
    let causedLinks = 0;
    let includedInLinks = 0;
    let triggeredLinks = 0;

    try {
      causedLinks = this.detectSessionToCommitLinks();
    } catch {
      errors++;
    }

    try {
      includedInLinks = this.detectCommitToPRLinks();
    } catch {
      errors++;
    }

    try {
      triggeredLinks = this.detectReviewToFixCommitLinks();
    } catch {
      errors++;
    }

    return { causedLinks, includedInLinks, triggeredLinks, errors };
  }

  detectSessionToCommitLinks(): number {
    const sessions = this.repository.getNotesBySourceUriPrefix("claude-session://");
    const commits = this.repository.getNotesBySourceUriPrefix("git://commit/");
    let linked = 0;

    for (const session of sessions) {
      const sessionFm = parseFrontmatter(session);
      const sessionBranch =
        typeof sessionFm["gitBranch"] === "string" ? sessionFm["gitBranch"] : null;
      const sessionTs = getTimestampSeconds(session.created_at);

      if (sessionTs === null || !sessionBranch) continue;

      for (const commit of commits) {
        const commitFm = parseFrontmatter(commit);
        const commitBranch = typeof commitFm["branch"] === "string" ? commitFm["branch"] : null;
        const commitTs = getTimestampSeconds(commit.created_at);

        if (commitTs === null || !commitBranch) continue;
        if (sessionBranch !== commitBranch) continue;

        const diffSeconds = commitTs - sessionTs;
        if (diffSeconds < 0 || diffSeconds >= SESSION_TO_COMMIT_THRESHOLD_SECONDS) continue;

        const saved = this.repository.saveNoteLinkIfNotExists(session.id, commit.id, "caused");
        if (saved) linked++;
      }
    }

    return linked;
  }

  detectCommitToPRLinks(): number {
    const commits = this.repository.getNotesBySourceUriPrefix("git://commit/");
    const allGithub = this.repository.getNotesBySourceUriPrefix("github://");
    const prs = allGithub.filter(isPrNote);
    let linked = 0;

    for (const commit of commits) {
      const sha = extractCommitShaFromUri(commit.file_path);
      if (!sha || sha.length < 7) continue;

      // 7文字以上のプレフィックスでマッチ
      for (const pr of prs) {
        const shortSha = sha.slice(0, 7);
        if (!pr.content.includes(shortSha) && !pr.content.includes(sha)) continue;

        const saved = this.repository.saveNoteLinkIfNotExists(commit.id, pr.id, "included_in");
        if (saved) linked++;
      }
    }

    return linked;
  }

  detectReviewToFixCommitLinks(): number {
    const allGithub = this.repository.getNotesBySourceUriPrefix("github://");
    const reviews = allGithub.filter(isReviewNote);
    const commits = this.repository.getNotesBySourceUriPrefix("git://commit/");
    let linked = 0;

    for (const review of reviews) {
      const reviewFm = parseFrontmatter(review);
      const reviewBranch = typeof reviewFm["branch"] === "string" ? reviewFm["branch"] : null;
      const reviewTs = getTimestampSeconds(review.created_at);

      if (reviewTs === null || !reviewBranch) continue;

      for (const commit of commits) {
        const commitFm = parseFrontmatter(commit);
        const commitBranch = typeof commitFm["branch"] === "string" ? commitFm["branch"] : null;
        const commitTs = getTimestampSeconds(commit.created_at);

        if (commitTs === null || !commitBranch) continue;
        if (reviewBranch !== commitBranch) continue;

        const diffSeconds = commitTs - reviewTs;
        if (diffSeconds < 0 || diffSeconds > REVIEW_TO_COMMIT_THRESHOLD_SECONDS) continue;

        const saved = this.repository.saveNoteLinkIfNotExists(review.id, commit.id, "triggered");
        if (saved) linked++;
      }
    }

    return linked;
  }
}
