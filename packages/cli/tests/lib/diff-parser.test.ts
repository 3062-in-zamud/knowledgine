import { describe, it, expect } from "vitest";
import { parseDiff } from "../../src/lib/diff-parser.js";

const SIMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,5 +1,7 @@
 import { User } from "./types";
+import { validateToken } from "./jwt";

 export function authenticate(token: string): User {
-  return null;
+  const payload = validateToken(token);
+  return { id: payload.sub, email: payload.email };
 }
`;

const MULTI_FILE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,4 @@
 import { User } from "./types";
+import { hash } from "./crypto";

 export function auth() {}
diff --git a/src/types.ts b/src/types.ts
index 111..222 100644
--- a/src/types.ts
+++ b/src/types.ts
@@ -1,3 +1,5 @@
 export interface User {
   id: string;
+  email: string;
+  role: "admin" | "user";
 }
`;

const BINARY_DIFF = `diff --git a/assets/logo.png b/assets/logo.png
index abc..def 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
diff --git a/src/index.ts b/src/index.ts
index 111..222 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,3 @@
 export * from "./auth";
+export * from "./types";
`;

const RENAME_DIFF = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 90%
rename from src/old-name.ts
rename to src/new-name.ts
index abc..def 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,4 @@
 export function foo() {}
+export function bar() {}
`;

describe("parseDiff", () => {
  it("unified diffから変更ファイル・行番号・追加内容を正しく抽出する", () => {
    const result = parseDiff(SIMPLE_DIFF);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/auth.ts");
    expect(result[0].addedLines).toContain(2); // import validateToken line
    expect(result[0].addedContent).toContain("import { validateToken } from");
    expect(result[0].addedContent).toContain("return { id: payload.sub");
    expect(result[0].removedLines).toContain(4); // return null line
  });

  it("複数ファイルを含むdiffを処理できる", () => {
    const result = parseDiff(MULTI_FILE_DIFF);

    expect(result).toHaveLength(2);
    const paths = result.map((f) => f.path);
    expect(paths).toContain("src/auth.ts");
    expect(paths).toContain("src/types.ts");

    const typesFile = result.find((f) => f.path === "src/types.ts")!;
    expect(typesFile.addedContent).toContain("email: string");
    expect(typesFile.addedContent).toContain('role: "admin" | "user"');
  });

  it("空diffで空配列を返す", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("   \n   \n")).toEqual([]);
  });

  it("バイナリファイル変更を含むdiffはバイナリをスキップしてテキストファイルを返す", () => {
    const result = parseDiff(BINARY_DIFF);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/index.ts");
    const paths = result.map((f) => f.path);
    expect(paths).not.toContain("assets/logo.png");
  });

  it("ファイルリネームのdiffは新ファイル名で処理する", () => {
    const result = parseDiff(RENAME_DIFF);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/new-name.ts");
    expect(result[0].addedContent).toContain("export function bar()");
  });

  it("ファイル数が50を超える場合は50ファイルで打ち切る", () => {
    // 60ファイル分のdiffを生成
    const diffLines: string[] = [];
    for (let i = 0; i < 60; i++) {
      diffLines.push(`diff --git a/src/file${i}.ts b/src/file${i}.ts`);
      diffLines.push(`index abc..def 100644`);
      diffLines.push(`--- a/src/file${i}.ts`);
      diffLines.push(`+++ b/src/file${i}.ts`);
      diffLines.push(`@@ -1,1 +1,2 @@`);
      diffLines.push(` export const x = 1;`);
      diffLines.push(`+export const y = 2;`);
    }
    const bigDiff = diffLines.join("\n");

    const result = parseDiff(bigDiff);
    expect(result).toHaveLength(50);
  });

  it('"diff --git" がない不正な入力は空配列を返す', () => {
    const invalidInput = `This is not a diff
Just some random text
With multiple lines`;

    expect(parseDiff(invalidInput)).toEqual([]);
  });
});
