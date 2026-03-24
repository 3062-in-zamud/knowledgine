/**
 * TypeScript/JavaScript ファイル向けスマートコンテンツ抽出。
 * import/export 文・関数/クラスシグネチャを優先的に含め、maxLength で切り詰める。
 */
export function extractSmartContent(content: string, options?: { maxLength?: number }): string {
  const maxLen = options?.maxLength ?? 2000;

  if (!content.trim()) return "";

  const lines = content.split("\n");

  // 高優先度パターン: import/export/function/class/interface/type/const/let/var
  const highPriorityPattern = /^\s*(import|export|function|class|interface|type|const|let|var)\b/;

  const highPriority: string[] = [];
  const lowPriority: string[] = [];

  for (const line of lines) {
    if (highPriorityPattern.test(line)) {
      highPriority.push(line);
    } else {
      lowPriority.push(line);
    }
  }

  // 高優先度行を先に詰め、残りスペースで低優先度行を埋める
  const parts: string[] = [];
  let remaining = maxLen;

  for (const line of highPriority) {
    const entry = line + "\n";
    if (remaining <= 0) break;
    if (entry.length > remaining) {
      parts.push(line.slice(0, remaining));
      remaining = 0;
      break;
    }
    parts.push(entry);
    remaining -= entry.length;
  }

  for (const line of lowPriority) {
    if (remaining <= 0) break;
    const entry = line + "\n";
    if (entry.length > remaining) {
      parts.push(line.slice(0, remaining));
      remaining = 0;
      break;
    }
    parts.push(entry);
    remaining -= entry.length;
  }

  return parts.join("").trimEnd();
}
