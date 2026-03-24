export interface DiffFile {
  path: string;
  addedLines: number[];
  removedLines: number[];
  addedContent: string; // 追加行のテキスト結合
}

const FILE_LIMIT = 50;

/**
 * unified diff形式をパースしてDiffFileの配列を返す。
 * - バイナリファイル ("Binary files ... differ") はスキップ
 * - ファイルリネーム ("rename to") → 新ファイル名を使用
 * - ファイル数上限: 50ファイルで打ち切り
 */
export function parseDiff(diffText: string): DiffFile[] {
  if (!diffText.trim()) return [];

  const results: DiffFile[] = [];
  const lines = diffText.split("\n");

  // 現在処理中のファイルの状態
  let currentPath: string | null = null;
  let isBinary = false;
  let addedLines: number[] = [];
  let removedLines: number[] = [];
  let addedContentLines: string[] = [];
  let newLineNum = 0;
  let oldLineNum = 0;
  let inHunk = false;

  const commitCurrent = () => {
    if (currentPath !== null && !isBinary) {
      results.push({
        path: currentPath,
        addedLines: [...addedLines],
        removedLines: [...removedLines],
        addedContent: addedContentLines.join("\n"),
      });
    }
  };

  const resetState = () => {
    currentPath = null;
    isBinary = false;
    addedLines = [];
    removedLines = [];
    addedContentLines = [];
    inHunk = false;
    newLineNum = 0;
    oldLineNum = 0;
  };

  for (const line of lines) {
    // 新しいファイルブロック開始
    if (line.startsWith("diff --git ")) {
      // 前のファイルを確定（上限未達の場合のみ）
      if (results.length < FILE_LIMIT) {
        commitCurrent();
      }
      resetState();

      // 上限に達したらそれ以上解析しない
      if (results.length >= FILE_LIMIT) break;

      // "diff --git a/path b/path" から b/path を抽出
      const match = /^diff --git a\/.+ b\/(.+)$/.exec(line);
      if (match) {
        currentPath = match[1];
      }
      continue;
    }

    // バイナリファイル検出
    if (line.startsWith("Binary files ") && line.includes(" differ")) {
      isBinary = true;
      continue;
    }

    // リネーム検出 ("rename to new-path")
    if (line.startsWith("rename to ")) {
      currentPath = line.slice("rename to ".length).trim();
      continue;
    }

    // --- / +++ ヘッダー行はスキップ（hunk 外にリセット）
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      inHunk = false;
      continue;
    }

    // hunk ヘッダー: @@ -a,b +c,d @@
    if (line.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
        inHunk = true;
      }
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("+")) {
      addedLines.push(newLineNum);
      addedContentLines.push(line.slice(1));
      newLineNum++;
    } else if (line.startsWith("-")) {
      removedLines.push(oldLineNum);
      oldLineNum++;
    } else {
      // コンテキスト行（空行 "" も含む）
      newLineNum++;
      oldLineNum++;
    }
  }

  // ループ終了後、最後のファイルを確定
  if (results.length < FILE_LIMIT) {
    commitCurrent();
  }

  return results;
}
