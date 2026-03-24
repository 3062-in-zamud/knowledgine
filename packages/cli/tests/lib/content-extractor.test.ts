import { describe, it, expect } from "vitest";
import { extractSmartContent } from "../../src/lib/content-extractor.js";

const TS_FILE_CONTENT = `import { User } from "./types";
import { hash } from "./crypto";

// This is a helper comment
const CONSTANT = 42;

function authenticate(token: string): User {
  // validate the token
  const isValid = token.length > 0;
  if (!isValid) {
    throw new Error("Invalid token");
  }
  return { id: "1", email: "test@example.com" };
}

class AuthService {
  private users: User[] = [];

  constructor() {
    this.users = [];
  }

  addUser(user: User): void {
    this.users.push(user);
  }
}

export { authenticate, AuthService };
export type { User };

const internalHelper = () => {
  return "helper result";
};

const anotherHelper = () => {
  const x = 1;
  const y = 2;
  return x + y;
};
`;

describe("extractSmartContent", () => {
  it("TypeScriptファイルからimport/export文が優先的に含まれる", () => {
    const result = extractSmartContent(TS_FILE_CONTENT, { maxLength: 500 });

    expect(result).toContain('import { User } from "./types"');
    expect(result).toContain('import { hash } from "./crypto"');
    expect(result).toContain("export { authenticate, AuthService }");
  });

  it("関数シグネチャが含まれる", () => {
    const result = extractSmartContent(TS_FILE_CONTENT, { maxLength: 500 });

    expect(result).toContain("function authenticate");
    expect(result).toContain("class AuthService");
  });

  it("maxLength で切り詰める", () => {
    const result = extractSmartContent(TS_FILE_CONTENT, { maxLength: 100 });

    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("空ファイルで空文字列を返す", () => {
    expect(extractSmartContent("")).toBe("");
    expect(extractSmartContent("   \n  \n  ")).toBe("");
  });

  it("デフォルトのmaxLengthは2000", () => {
    const longContent = "const x = 1;\n".repeat(300); // ~4200文字
    const result = extractSmartContent(longContent);

    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it("const/let/var のシグネチャが含まれる", () => {
    const content = `const TIMEOUT = 5000;
let counter = 0;
var legacy = true;
const fn = () => {
  return 42;
};
// a comment line
const another = "value";
`;
    const result = extractSmartContent(content, { maxLength: 500 });

    expect(result).toContain("const TIMEOUT");
    expect(result).toContain("let counter");
    expect(result).toContain("const fn");
  });

  it("高優先度行が先に詰められ、残りスペースに低優先度行が含まれる", () => {
    const content = `import { foo } from "./foo";
// comment 1
// comment 2
// comment 3
export function bar() {}
`;
    // maxLength を小さくして低優先度行が落ちることを確認
    const resultSmall = extractSmartContent(content, { maxLength: 60 });
    expect(resultSmall).toContain("import { foo }");
    expect(resultSmall).toContain("export function bar");

    // maxLength を大きくすれば低優先度行も含まれる
    const resultLarge = extractSmartContent(content, { maxLength: 500 });
    expect(resultLarge).toContain("// comment");
  });
});
