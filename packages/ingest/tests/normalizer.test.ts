import { describe, it, expect } from "vitest";
import {
  sanitizeContent,
  computeContentHash,
  normalizeToKnowledgeData,
  normalizeToKnowledgeEvent,
} from "../src/normalizer.js";
import type { NormalizedEvent } from "../src/types.js";

function createMockEvent(overrides?: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    sourceUri: "mock://test/event/1",
    eventType: "document",
    title: "Test Event",
    content: "Normal content without secrets",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    metadata: {
      sourcePlugin: "markdown",
      sourceId: "evt-1",
      author: "test-author",
      project: "test-project",
      tags: ["tag1", "tag2"],
    },
    ...overrides,
  };
}

describe("sanitizeContent", () => {
  it("シークレットなしの場合は変更なし", () => {
    const content = "This is normal content without any secrets.";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("APIキーをマスクする", () => {
    const content = 'api_key: "abcdef1234567890abcdef"';
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("abcdef1234567890abcdef");
  });

  it("GitHub PAT (ghp_) をマスクする", () => {
    const content = "token: ghp_abcdefghijklmnopqrstuvwxyz123456789012";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456789012");
  });

  it("Slack token (xoxb-) をマスクする", () => {
    // トークンを動的に組み立てて GitHub Secret Scanning の誤検知を回避
    const slackToken = ["xoxb", "12345678901", "abcdefghijklmnop"].join("-");
    const content = `slack token: ${slackToken}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(slackToken);
  });

  it("sk- プレフィクストークン (OpenAI等) をマスクする", () => {
    const content = "key=sk-abcdefghijklmnopqrstuvwxyz1234567890abcd";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234567890abcd");
  });

  it("Anthropic API キー (sk-ant-api03-...) をマスクする", () => {
    const anthKey = "sk-ant-" + "api03-" + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const content = `auth: ${anthKey}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(anthKey);
  });

  it("Anthropic admin キー (sk-ant-admin01-...) もマスクする", () => {
    const admin = "sk-ant-" + "admin01-" + "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const content = `header: ${admin}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(admin);
  });

  it("GitLab PAT (glpat-) をマスクする", () => {
    const content = "gitlab: glpat-abcdefghijklmnopqrst";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("glpat-abcdefghijklmnopqrst");
  });

  it("シークレットを含む長いテキストで他のコンテンツは保持", () => {
    const content =
      "Normal text. api_key: sk-1234567890abcdefghij1234567890abcdef. More normal text.";
    const result = sanitizeContent(content);
    expect(result).toContain("Normal text.");
    expect(result).toContain("More normal text.");
  });
});

describe("computeContentHash", () => {
  it("同じコンテンツは同じハッシュ", () => {
    const content = "test content";
    expect(computeContentHash(content)).toBe(computeContentHash(content));
  });

  it("異なるコンテンツは異なるハッシュ", () => {
    expect(computeContentHash("content a")).not.toBe(computeContentHash("content b"));
  });

  it("SHA-256の16進数文字列 (64文字)", () => {
    const hash = computeContentHash("test");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("空文字列もハッシュ化できる", () => {
    const hash = computeContentHash("");
    expect(hash).toHaveLength(64);
  });
});

describe("normalizeToKnowledgeData", () => {
  it("NormalizedEventをKnowledgeDataに変換する", () => {
    const event = createMockEvent();
    const result = normalizeToKnowledgeData(event);

    expect(result.filePath).toBe("mock://test/event/1");
    expect(result.title).toBe("Test Event");
    expect(result.content).toBe("Normal content without secrets");
    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("frontmatterにsource_pluginとsource_idが含まれる", () => {
    const event = createMockEvent();
    const result = normalizeToKnowledgeData(event);

    expect(result.frontmatter.source_plugin).toBe("markdown");
    expect(result.frontmatter.source_id).toBe("evt-1");
  });

  it("tagsがある場合frontmatterに含まれる", () => {
    const event = createMockEvent();
    const result = normalizeToKnowledgeData(event);
    expect(result.frontmatter.tags).toEqual(["tag1", "tag2"]);
  });

  it("tagsがない場合frontmatterに含まれない", () => {
    const event = createMockEvent({
      metadata: { sourcePlugin: "markdown", sourceId: "evt-1" },
    });
    const result = normalizeToKnowledgeData(event);
    expect(result.frontmatter.tags).toBeUndefined();
  });

  it("コンテンツのシークレットをサニタイズする", () => {
    const event = createMockEvent({ content: "secret: api_key = abcdef1234567890abcdef" });
    const result = normalizeToKnowledgeData(event);
    expect(result.content).not.toContain("abcdef1234567890abcdef");
    expect(result.content).toContain("[REDACTED]");
  });
});

describe("normalizeToKnowledgeEvent", () => {
  it("NormalizedEventをKnowledgeEventに変換する", () => {
    const event = createMockEvent();
    const result = normalizeToKnowledgeEvent(event);

    expect(result.eventType).toBe("document_change");
    expect(result.sourceType).toBe("markdown");
    expect(result.sourceId).toBe("evt-1");
    expect(result.sourceUri).toBe("mock://test/event/1");
    expect(result.actor).toBe("test-author");
    expect(result.occurredAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.projectId).toBe("test-project");
  });

  it("contentHashが設定される", () => {
    const event = createMockEvent();
    const result = normalizeToKnowledgeEvent(event);
    expect(result.contentHash).toHaveLength(64);
    expect(result.contentHash).toMatch(/^[0-9a-f]+$/);
  });

  it("commit eventTypeはgit_commitにマッピング", () => {
    const event = createMockEvent({ eventType: "commit" });
    expect(normalizeToKnowledgeEvent(event).eventType).toBe("git_commit");
  });

  it("session eventTypeはsession_startにマッピング", () => {
    const event = createMockEvent({ eventType: "session" });
    expect(normalizeToKnowledgeEvent(event).eventType).toBe("session_start");
  });

  it("未知のeventTypeはmanual_observationにフォールバック", () => {
    // 型キャストで未知の値をテスト
    const event = createMockEvent({ eventType: "unknown_type" as never });
    expect(normalizeToKnowledgeEvent(event).eventType).toBe("manual_observation");
  });

  it("git-historyプラグインはgit sourceTypeにマッピング", () => {
    const event = createMockEvent({
      metadata: { sourcePlugin: "git-history", sourceId: "evt-1" },
    });
    expect(normalizeToKnowledgeEvent(event).sourceType).toBe("git");
  });

  it("未知のプラグインはmanual sourceTypeにフォールバック", () => {
    const event = createMockEvent({
      metadata: { sourcePlugin: "unknown-plugin", sourceId: "evt-1" },
    });
    expect(normalizeToKnowledgeEvent(event).sourceType).toBe("manual");
  });

  it("コンテンツのシークレットをサニタイズしてハッシュ計算", () => {
    const secret = "ghp_abcdefghijklmnopqrstuvwxyz123456789012";
    const event = createMockEvent({ content: `token: ${secret}` });
    const result = normalizeToKnowledgeEvent(event);
    expect(result.content).not.toContain(secret);
    expect(result.content).toContain("[REDACTED]");
    expect(result.contentHash).toBe(computeContentHash(result.content));
  });

  it("[KNOW-401] env-var 形式の secret は変数名ごと redact され、contentHash に secret は含まれない", () => {
    const ghpToken = "ghp_" + "f".repeat(36);
    const event = createMockEvent({ content: `GITHUB_TOKEN="${ghpToken}"` });
    const result = normalizeToKnowledgeEvent(event);
    // 変数名ごと redact され、結果は "[REDACTED]" のみ
    expect(result.content).toBe("[REDACTED]");
    expect(result.content).not.toContain("GITHUB_");
    expect(result.content).not.toContain(ghpToken);
    // contentHash は redact 後の hash（secret を含まない）
    expect(result.contentHash).toBe(computeContentHash("[REDACTED]"));
  });
});
