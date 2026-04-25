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
    // KNOW-401: 変数名前半 (GITHUB_) も redact されることをロック
    expect(result).not.toContain("GITHUB_");
  });

  it("Slack bot token (xoxb-) をマスクする", () => {
    const slackToken = ["xoxb", "12345678901", "abcdefghijklmnop"].join("-");
    const content = `SLACK_TOKEN=${slackToken}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(slackToken);
    // KNOW-401: 変数名前半 (SLACK_) も redact されることをロック
    expect(result).not.toContain("SLACK_");
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
    // KNOW-401: pattern B 導入後は変数名 (api_key) も redact されることをロック
    expect(result).not.toContain("api_key");
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
    // KNOW-401: "gitlab" は pattern B keyword 非該当のため変数名は維持される
    expect(result).toContain("gitlab:");
  });

  // --- KNOW-401: プレフィックス漏れ回帰テスト ---

  it("GITHUB_TOKEN=ghp_xxx → トークン値と変数名がマスクされる", () => {
    const ghpToken = "ghp_" + "a".repeat(36);
    const content = `GITHUB_TOKEN=${ghpToken}`;
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(ghpToken);
    // KNOW-401: 変数名 (GITHUB_TOKEN) も redact されることをロック
    expect(result).not.toContain("GITHUB_TOKEN");
  });

  it("DATABASE_URL=postgres://user:pass@host:5432/db → 接続文字列と変数名がマスクされる", () => {
    const content = "DATABASE_URL=postgres://user:pass@host:5432/db";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("postgres://user:pass@host:5432/db");
    // KNOW-401: 変数名 (DATABASE_URL) も redact されることをロック
    expect(result).not.toContain("DATABASE_URL");
  });

  it("AWS_SECRET_ACCESS_KEY=xxx → AWS_SECRET_ACCESS_KEY も消える", () => {
    const content = 'AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("AWS_SECRET");
    // KNOW-401: 変数名全体 (AWS_SECRET_ACCESS_KEY) と値の一部もすべて redact
    expect(result).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(result).not.toContain("wJalrXUtnFEMI");
  });

  it("複数シークレットが同一行にある場合すべて変数名ごとマスクされる", () => {
    const ghpToken = "ghp_" + "b".repeat(36);
    const content = `API_KEY="sk-proj-abcdef1234567890" GITHUB_TOKEN=${ghpToken}`;
    const result = sanitizeContent(content);
    expect(result).not.toContain("sk-proj-abcdef1234567890");
    expect(result).not.toContain(ghpToken);
    // KNOW-401: 両方の変数名 (API_KEY / GITHUB_TOKEN) も redact されることをロック
    expect(result).not.toContain("API_KEY");
    expect(result).not.toContain("GITHUB_TOKEN");
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

  // --- KNOW-401: env-var-style assignments (Pattern A: UPPER_SNAKE_CASE) ---

  it('[KNOW-401 A] GITHUB_TOKEN="ghp_..." は変数名ごと redact される', () => {
    const ghpToken = "ghp_" + "a".repeat(36);
    const content = `GITHUB_TOKEN="${ghpToken}"`;
    const result = sanitizeContent(content);
    expect(result).toBe("[REDACTED]");
    expect(result).not.toContain("GITHUB_");
  });

  it('[KNOW-401 A] AWS_ACCESS_KEY_ID="AKIA..." は変数名ごと redact される', () => {
    const fakeAwsKey = "AKIA" + "IOSFODNN7EXAMPLE";
    const content = `AWS_ACCESS_KEY_ID="${fakeAwsKey}"`;
    const result = sanitizeContent(content);
    expect(result).toBe("[REDACTED]");
    expect(result).not.toContain("AWS_ACCESS_KEY_ID");
  });

  it('[KNOW-401 A] SLACK_BOT_TOKEN="xoxb-..." は変数名ごと redact される', () => {
    const slackToken = ["xoxb", "12345678901", "abcdefghijklmnop"].join("-");
    const content = `SLACK_BOT_TOKEN="${slackToken}"`;
    const result = sanitizeContent(content);
    expect(result).toBe("[REDACTED]");
    expect(result).not.toContain("SLACK_BOT");
  });

  it('[KNOW-401 A] OPENAI_API_KEY="sk-proj-..." は変数名ごと redact される', () => {
    const content = `OPENAI_API_KEY="sk-proj-${"x".repeat(40)}"`;
    const result = sanitizeContent(content);
    expect(result).toBe("[REDACTED]");
    expect(result).not.toContain("OPENAI_API_KEY");
  });

  it("[KNOW-401 A] export DATABASE_URL=postgres://... (unquoted + shell export) が全体 redact される", () => {
    const content = "export DATABASE_URL=postgres://u:p@h:5432/db";
    const result = sanitizeContent(content);
    expect(result).not.toContain("DATABASE_URL");
    expect(result).not.toContain("postgres");
  });

  it("[KNOW-401 A] YAML 形式 STRIPE_SECRET_KEY: 'sk_live_...' が全体 redact される", () => {
    // "sk" + "_live_" 分割で GitHub Secret Scanning 誤検知回避
    const content = "STRIPE_SECRET_KEY: '" + "sk" + "_live_" + "a".repeat(24) + "'";
    const result = sanitizeContent(content);
    expect(result).not.toContain("STRIPE_SECRET_KEY");
  });

  it("[KNOW-401 A] 1 行に 2 つの env-var secret があっても両方変数名ごと redact される", () => {
    const ghpToken = "ghp_" + "c".repeat(36);
    const fakeAwsKey = "AKIA" + "ABCDEFGHIJKLMNOP";
    const content = `GITHUB_TOKEN=${ghpToken} AWS_ACCESS_KEY_ID=${fakeAwsKey}`;
    const result = sanitizeContent(content);
    expect(result).not.toContain("GITHUB_TOKEN");
    expect(result).not.toContain("AWS_ACCESS_KEY_ID");
    expect(result).not.toContain(ghpToken);
    expect(result).not.toContain(fakeAwsKey);
  });

  // --- KNOW-401: env-var-style assignments (Pattern B: lower/camelCase) ---

  it('[KNOW-401 B] lower-case github_token="..." は変数名ごと redact される', () => {
    const ghpToken = "ghp_" + "d".repeat(36);
    const content = `github_token="${ghpToken}"`;
    const result = sanitizeContent(content);
    expect(result).toBe("[REDACTED]");
    expect(result).not.toContain("github_");
  });

  it("[KNOW-401 B] camelCase databaseUrl: '...' は変数名ごと redact される", () => {
    const content = "databaseUrl: 'postgres://u:p@h/db'";
    const result = sanitizeContent(content);
    expect(result).not.toContain("databaseUrl");
    expect(result).not.toContain("postgres");
  });

  // --- KNOW-401: 追加 edge cases (idempotency / ReDoS / backtick) ---

  it("[KNOW-401 idempotency] sanitizeContent(sanitizeContent(x)) === sanitizeContent(x)", () => {
    const ghpToken = "ghp_" + "a".repeat(36);
    const fakeAwsKey = "AKIA" + "IOSFODNN7EXAMPLE";
    const content = `GITHUB_TOKEN="${ghpToken}" normal_text AWS_ACCESS_KEY_ID="${fakeAwsKey}"`;
    const once = sanitizeContent(content);
    const twice = sanitizeContent(once);
    expect(twice).toBe(once);
  });

  it("[KNOW-401] env-var 前の改行は redact 後も保持される", () => {
    // 先頭境界を zero-width lookbehind にしたことで、preceding char を消費しない
    const ghp = "ghp_" + "a".repeat(36);
    const content = `foo\nGITHUB_TOKEN="${ghp}"`;
    const result = sanitizeContent(content);
    expect(result).toBe("foo\n[REDACTED]");
  });

  it("[KNOW-401] 区切り文字 (`;`) の前後の env-var が redact され区切りが保持される", () => {
    const ghp = "ghp_" + "b".repeat(36);
    const content = `before;GITHUB_TOKEN="${ghp}"`;
    const result = sanitizeContent(content);
    expect(result).toBe("before;[REDACTED]");
  });

  it("[KNOW-401] 行頭の env-var も lookbehind で正しく redact される", () => {
    const ghp = "ghp_" + "c".repeat(36);
    const content = `GITHUB_TOKEN="${ghp}"`;
    const result = sanitizeContent(content);
    expect(result).toBe("[REDACTED]");
  });

  it("[KNOW-401 ReDoS] 10KB 長の敵対入力でも 200ms 以内に完了する", () => {
    const longName = "A".repeat(10000) + "_TOKEN";
    const content = `${longName}="${"x".repeat(100)}"`;
    const start = Date.now();
    const result = sanitizeContent(content);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
    // 結果は redact されてもされなくても OK（timeout のみが AC）
    expect(typeof result).toBe("string");
  }, 500);

  it("[KNOW-401] バッククォート値 GITHUB_TOKEN=`ghp_...` の値は redact される", () => {
    const ghpToken = "ghp_" + "e".repeat(36);
    const content = "GITHUB_TOKEN=`" + ghpToken + "`";
    const result = sanitizeContent(content);
    // バッククォート値は negative class 経由で redact される
    expect(result).not.toContain(ghpToken);
  });

  // --- KNOW-401: false positive 防止 negative tests ---

  it("[KNOW-401 negative] const TOKEN_REGEX = /.../ は変更されない", () => {
    const content = "const TOKEN_REGEX = /^abc$/;";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("[KNOW-401 negative] # DATABASE_URL is required のようなコメントは変更されない", () => {
    const content = "# DATABASE_URL is required before boot";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("[KNOW-401 negative] 散文中の API_KEY 言及は変更されない", () => {
    const content = "The API_KEY environment variable controls behavior.";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("[KNOW-401 negative] const tokenizer = new Tokenizer(); は変更されない", () => {
    const content = "const tokenizer = new Tokenizer();";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("[KNOW-401 negative] function getAuthToken() {} は変更されない", () => {
    const content = "function getAuthToken() { return 42; }";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("[KNOW-401 negative] // my_api_key handling logic のようなコメント行は変更されない", () => {
    const content = "// my_api_key handling logic";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("[KNOW-401 negative] passage = 'long text' は変更されない (password keyword boundary)", () => {
    // "passage" は "password" と prefix 一部共有するが boundary で不一致
    const content = "passage = 'long text continues here'";
    expect(sanitizeContent(content)).toBe(content);
  });

  it("[KNOW-401 negative] Markdown inline code `GITHUB_TOKEN=xxx` は変更されない", () => {
    // バッククォートで囲まれた inline code は先頭アンカー外なので原則 match しない
    const content = "Set the `GITHUB_TOKEN=example` env var before running.";
    const result = sanitizeContent(content);
    expect(result).toBe(content);
  });

  it("[KNOW-401] process.env.GITHUB_TOKEN 参照は既存 L6 (token=...) で redact される（既存挙動 lock）", () => {
    // 注: 本テストは KNOW-401 の対象外。代入なし参照は既存 L6 の汎用パターン
    // (?:token|...)['":\s]*[=:]\s*['"]?[a-zA-Z0-9_\-/.]{16,} で `token = process.env.GITHUB_TOKEN`
    // が match するため `[REDACTED]` に置換される。新パターン導入後もこの挙動は維持されるべき。
    const content = "const token = process.env.GITHUB_TOKEN;";
    const result = sanitizeContent(content);
    expect(result).toContain("[REDACTED]");
    // 既存挙動として "process.env.GITHUB_TOKEN" は redact される
    expect(result).not.toContain("process.env.GITHUB_TOKEN");
  });
});
