import { describe, it, expect } from "vitest";
import { sanitizeContent } from "../src/normalizer.js";

describe("secret redaction 強化", () => {
  it("AWS Access Key ID をマスクする", () => {
    // 動的に組み立てて GitHub Secret Scanning の誤検知を回避
    const fakeAwsKey = "AKIA" + "IOSFODNN7EXAMPLE";
    const content = `AWS_ACCESS_KEY_ID=${fakeAwsKey}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(fakeAwsKey);
  });

  it("JWT Token をマスクする", () => {
    // 動的に組み立てて GitHub Secret Scanning の誤検知を回避
    const fakeJwt =
      "eyJhbGci" +
      "OiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIi" +
      "OiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const content = `Authorization: Bearer ${fakeJwt}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(fakeJwt);
  });

  it("Database connection string (postgres) をマスクする", () => {
    const content = "DATABASE_URL=postgres://user:pass@host:5432/db";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("postgres://user:pass@host:5432/db");
  });

  it("Database connection string (mysql) をマスクする", () => {
    const content = "DB_URL=mysql://admin:secret@localhost:3306/mydb";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("mysql://admin:secret@localhost:3306/mydb");
  });

  it("Private key header をマスクする", () => {
    const content = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("-----BEGIN RSA PRIVATE KEY-----");
  });

  it("Generic secret in env var context をマスクする", () => {
    const content = 'SECRET_KEY = "abc123def456ghijklmn"';
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("abc123def456ghijklmn");
  });

  it("GitHub personal access tokens (ghs_) をマスクする", () => {
    // トークンを動的に組み立てて GitHub Secret Scanning の誤検知を回避
    const ghsToken = ["ghs", "A".repeat(36)].join("_");
    const content = `GITHUB_TOKEN=${ghsToken}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(ghsToken);
  });

  it("Slack bot token (xoxb-) をマスクする", () => {
    const slackToken = ["xoxb", "12345678901", "abcdefghijklmnop"].join("-");
    const content = `SLACK_TOKEN=${slackToken}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(slackToken);
  });

  it("通常のテキストはマスクされない", () => {
    const content = "This is normal text without any secrets.";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("URL に認証情報がない場合はマスクされない", () => {
    const content = "Visit https://example.com/path for documentation.";
    const result = sanitizeContent(content);
    expect(result).toBe(content);
  });

  // リグレッション: 既存パターンが引き続き動作すること
  it("[regression] APIキーパターンが引き続き動作する", () => {
    const content = 'api_key: "abcdef1234567890abcdef"';
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("abcdef1234567890abcdef");
  });

  it("[regression] GitHub PAT (ghp_) が引き続き動作する", () => {
    const secret = "ghp_abcdefghijklmnopqrstuvwxyz123456789012";
    const content = `token: ${secret}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(secret);
  });

  it("[regression] GitLab PAT (glpat-) が引き続き動作する", () => {
    const content = "gitlab: glpat-abcdefghijklmnopqrst";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("glpat-abcdefghijklmnopqrst");
  });

  // --- KNOW-401: プレフィックス漏れ回帰テスト ---

  it("GITHUB_TOKEN=ghp_xxx → トークン値がマスクされる", () => {
    const ghpToken = "ghp_" + "a".repeat(36);
    const content = `GITHUB_TOKEN=${ghpToken}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(ghpToken);
  });

  it("DATABASE_URL=postgres://user:pass@host:5432/db → 接続文字列がマスクされる", () => {
    const content = "DATABASE_URL=postgres://user:pass@host:5432/db";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("postgres://user:pass@host:5432/db");
  });

  it("AWS_SECRET_ACCESS_KEY=xxx → AWS_SECRET も消える", () => {
    const content = 'AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("AWS_SECRET");
  });

  it("複数シークレットが同一行にある場合すべてマスクされる", () => {
    const ghpToken = "ghp_" + "b".repeat(36);
    const content = `API_KEY="sk-proj-abcdef1234567890" GITHUB_TOKEN=${ghpToken}`;
    const result = sanitizeContent(content);
    expect(result).not.toContain("sk-proj-abcdef1234567890");
    expect(result).not.toContain(ghpToken);
  });

  it('YAML形式 token: "sk-xxx" をマスクする', () => {
    const content = 'token: "sk-proj-abcdefghijklmnopqrstuvwxyz"';
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz");
  });

  it("Authorization: Bearer eyJxxx をマスクする", () => {
    const fakeJwt =
      "eyJhbGci" +
      "OiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIi" +
      "OiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const content = `Authorization: Bearer ${fakeJwt}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("Bearer");
    expect(result).not.toContain(fakeJwt);
  });

  it("Authorization: Basic dXNlcm5hbWU6xxx をマスクする", () => {
    const basicCred = "dXNlcm5hbWU6cGFzc3dvcmQxMjM0NTY3ODkw";
    const content = `Authorization: Basic ${basicCred}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("Basic");
    expect(result).not.toContain(basicCred);
  });

  // --- KNOW-401: 過剰redaction否定テスト ---

  it("AUTHENTICATION_FLOW = oauth2-standard は変更されない", () => {
    const content = "AUTHENTICATION_FLOW = oauth2-standard";
    const result = sanitizeContent(content);
    expect(result).toBe(content);
  });
});
