# Cline Session Storage — Research Notes

**Investigation date:** 2026-04-25
**Pinned Cline version:** [`v3.81.0`](https://github.com/cline/cline/releases/tag/v3.81.0) (released 2026-04-24)
**Pinned source paths:**

- [`src/core/storage/disk.ts`](https://github.com/cline/cline/blob/v3.81.0/src/core/storage/disk.ts)
- [`src/core/storage/StateManager.ts`](https://github.com/cline/cline/blob/v3.81.0/src/core/storage/StateManager.ts)
- [`src/shared/HistoryItem.ts`](https://github.com/cline/cline/blob/v3.81.0/src/shared/HistoryItem.ts)
- [`src/core/context/context-tracking/ContextTrackerTypes.ts`](https://github.com/cline/cline/blob/v3.81.0/src/core/context/context-tracking/ContextTrackerTypes.ts)

## Goal

Cline (`saoudrizwan.claude-dev` VS Code extension) のオンディスクセッション形式を文書化し、knowledgine `cline-sessions` ingest plugin が安全にパースできる根拠を整理する。

## Re-evaluation Rationale (supersedes prior "push-only" conclusion)

`docs/push-based-capture.md` の旧版 (L181-189) は「Cline ストレージは非公開でバージョン依存が不安定」として pull 型を断念していた。本調査により以下が判明し、結論を覆す:

1. **形式は安定 JSON**: SQLite / leveldb ではなく純粋 JSON。読み取り側の依存ランタイムが最小化できる。
2. **書き込みは atomic**: Cline の `atomicWriteFile` は `temp + rename` パターンを使う ([`disk.ts:30-42`](https://github.com/cline/cline/blob/v3.81.0/src/core/storage/disk.ts#L30-L42))。読み取り中に partial JSON を見ることがない。
3. **ファイル名定数は exported な `GlobalFileNames`** ([`disk.ts:44-69`](https://github.com/cline/cline/blob/v3.81.0/src/core/storage/disk.ts#L44-L69))。マイナーバージョン間で名前変更があれば PR レベルで検知可能。
4. **API conversation history は Anthropic SDK 標準の `Anthropic.MessageParam[]`**。Cline 固有の internal 形式に依存しない。
5. **fixtures に Cline tag を pin** することで CI が drift を早期検知できる。

push 型 (`POST /capture`、v0.6.0 で実装済) は引き続き Windsurf / Codex / Copilot Chat 等の未対応ツール向けに有効であり、本 pull プラグインと併用関係。

## Storage Layout (per OS)

VS Code の `ExtensionContext.globalStorageUri.fsPath` 配下:

| OS          | Default Path                                                                    |
| ----------- | ------------------------------------------------------------------------------- |
| **macOS**   | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/` |
| **Linux**   | `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/`                     |
| **Windows** | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\`                     |

**派生エディタ (out of scope for v0.1.0、`CLINE_STORAGE_PATH` 環境変数で回避可)**:

- VS Code Insiders: `Code - Insiders/User/globalStorage/...`
- VSCodium: `~/.config/VSCodium/User/globalStorage/...`
- Cursor: `~/Library/Application Support/Cursor/User/globalStorage/...`
- Windsurf: `~/.codeium/windsurf/User/globalStorage/...`

## Directory Structure

`getGlobalStorageDir(...subdirs)` は `globalStorageFsPath/<subdirs>` を返す ([`disk.ts:362-365`](https://github.com/cline/cline/blob/v3.81.0/src/core/storage/disk.ts) — see code at v3.81.0):

```
saoudrizwan.claude-dev/
├── state/
│   └── taskHistory.json              # HistoryItem[] (タスクインデックス、ingest 必須)
├── tasks/
│   └── <taskId>/
│       ├── api_conversation_history.json   # Anthropic.MessageParam[] (主データ)
│       ├── ui_messages.json                # ClineMessage[] (UI 内部、フォールバック)
│       ├── task_metadata.json              # FileContextTracker の TaskMetadata (ingest 副次)
│       └── context_history.json            # context optimization 状態 (ingest 不要)
├── settings/
│   └── cline_mcp_settings.json
└── cache/
    └── ...                            # (ingest 不要)
```

> **注意**: `state/taskHistory.json` は **タスクの実体メタデータ**（プロンプト本文、tokensIn/Out、cwd など）を持つ唯一のソース。`tasks/<id>/task_metadata.json` は名前から想像される「タスク基本情報」ではなく、context tracking 用の別ファイルである。

## File Schemas (v3.81.0)

### 1. `state/taskHistory.json` — 配列の `HistoryItem[]`

[`HistoryItem.ts`](https://github.com/cline/cline/blob/v3.81.0/src/shared/HistoryItem.ts):

```typescript
type HistoryItem = {
  id: string; // task ID (ディレクトリ名と一致)
  ulid?: string; // ULID (新形式、追跡用)
  ts: number; // unix ms timestamp (タスク開始)
  task: string; // 元のユーザープロンプト全文
  tokensIn: number;
  tokensOut: number;
  cacheWrites?: number;
  cacheReads?: number;
  totalCost: number; // USD
  size?: number; // ディスク使用量 (bytes)
  shadowGitConfigWorkTree?: string; // checkpoints/ 用 shadow git
  cwdOnTaskInitialization?: string; // タスク開始時 workspace (絶対パス)
  conversationHistoryDeletedRange?: [number, number];
  isFavorited?: boolean;
  checkpointManagerErrorMessage?: string;
  modelId?: string;
};
```

**ingest plugin 利用方針**:

- `task` (ユーザープロンプト) → `title` の素材 (先頭 60 字)
- `cwdOnTaskInitialization` → `metadata.extra.workspace` (basename をタグ化)
- `ts` → `timestamp` のフォールバック (api_conversation_history が空の場合)
- `tokensIn/Out`, `totalCost`, `size` → `metadata.extra` に格納 (集計用)

### 2. `tasks/<taskId>/api_conversation_history.json` — `Anthropic.MessageParam[]`

[`disk.ts:241-257`](https://github.com/cline/cline/blob/v3.81.0/src/core/storage/disk.ts) で `JSON.parse(fs.readFile(...))` のみ。Anthropic SDK の標準型:

```typescript
type MessageParam = {
  role: "user" | "assistant";
  content: string | Array<TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock>;
};

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: object };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string | TextBlock[] };
```

**ingest plugin 利用方針**:

- このファイルが **主データソース**。テキスト抽出は `extractTextContent` (knowledgine 共有ユーティリティ) を使用
- `tool_use` のみのメッセージは除外 (claude-sessions と同様の挙動)
- `Anthropic.MessageParam` には timestamp フィールドが**ない** → `taskHistory.json` の `ts` を tasks 全体の代表値として使用

### 3. `tasks/<taskId>/ui_messages.json` — `ClineMessage[]`

`@shared/ExtensionMessage` の `ClineMessage` 型 (Cline 内部 UI 形式)。`api_conversation_history.json` が読めなかった場合のフォールバック専用:

```typescript
type ClineMessage = {
  ts: number;
  type: "ask" | "say";
  ask?: string;
  say?: string;
  text?: string;
  // ... Cline 内部フィールド多数
};
```

**ingest plugin 利用方針**:

- 主データソースが読めない場合のフォールバックのみ。本実装では実装するが、tolerance test として最小限のフィールド抽出にとどめる
- `ts` (per-message timestamp) があるので、ここから復元する場合のみ message-level timestamp を採用

### 4. `tasks/<taskId>/task_metadata.json` — `TaskMetadata` (FileContextTracker)

[`ContextTrackerTypes.ts`](https://github.com/cline/cline/blob/v3.81.0/src/core/context/context-tracking/ContextTrackerTypes.ts):

```typescript
interface TaskMetadata {
  files_in_context: FileMetadataEntry[]; // 編集/参照されたファイル
  model_usage: ModelMetadataEntry[]; // 使用モデル履歴
  environment_history: EnvironmentMetadataEntry[]; // OS / Cline version 等
}
```

**ingest plugin 利用方針 (v0.1.0 — 実装ベース)**:

- 必須ではない (主データは api_conversation_history.json と taskHistory.json で完結)
- v0.1.0 実装では **incremental ingest の mtime 判定にのみ使用**。`files_in_context` を `metadata.extra.relatedFiles` として取り込む処理は **未実装**
- 不在 / 破損は無視 (skipReason に記録しない)
- **将来拡張**: `metadata.extra.relatedFiles` 抽出 + graph extraction との連携は別チケットで対応 (`context_history.json` 活用と合わせる方針)

## Risks & Mitigations

| #   | リスク                                                                     | 影響                       | 緩和策                                                                                                   |
| --- | -------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | スキーマ drift (Cline 4.x など major release)                              | パース失敗、データ抽出不全 | fixtures に v3.81.0 を pin、unknown field tolerance テスト、major release 検知 → spec 改訂               |
| 2   | `api_conversation_history.json` が atomic write の最中に開かれる           | partial JSON               | atomic rename パターンが Cline 側で実装済み (`disk.ts:30-42`)。**plugin 側追加対策不要**                 |
| 3   | Windows ファイルロック (Cline issue #8004)                                 | EBUSY / EPERM              | `EBUSY` / `EPERM` を catch → skip + stderr `⚠ Skipped (<taskId>): file busy`                             |
| 4   | JSON 破損 (Cline issue #7101)                                              | パース失敗                 | try/catch で飲み込み、`skipReason: "parse error"` を返す                                                 |
| 5   | 50MB 超の長期タスク                                                        | Node ヒープ急増            | `stat` で 10MB 超を skip、Known Limitation 化                                                            |
| 6   | 複数 VS Code インストール (Insiders / Cursor / Windsurf) で同 task ID 衝突 | sourceUri 衝突             | sourceUri に `storageHash8`(=sha256(storageDir)[:8]) を含める: `cline-session://<storageHash8>/<taskId>` |
| 7   | API キー / Bearer / JWT が conversation 内に含まれる                       | secret leak                | `sanitizeContent` を必ず通す。fixtures に合成 `sk-ant-api03-` トークンを含めて redaction を検証          |
| 8   | path traversal (`../../etc/passwd` を `CLINE_STORAGE_PATH` で渡される)     | 任意ディレクトリ read      | `isAbsolute` 検証 + `realpath` で symlink 解決                                                           |
| 9   | `taskHistory.json` のロード失敗 / 不在                                     | task のメタデータ取得不能  | tasks ディレクトリ単独でも動作: title は taskId 先頭 8 字、timestamp は ファイル mtime にフォールバック  |

## Decisions for the v0.1.0 plugin

1. **主データ**: `api_conversation_history.json` + `state/taskHistory.json` (HistoryItem)
2. **フォールバック**: `ui_messages.json` (api が読めない場合のみ)
3. **無視**: `context_history.json` (将来的に context graph 拡張で使う可能性あり、別チケット)
4. **副次**: `task_metadata.json` (relatedPaths の素材として、存在時のみ)
5. **incremental checkpoint**: タスク内 3 ファイル (`api_conversation_history.json`, `ui_messages.json`, `task_metadata.json`) の **max mtime** を採用。`taskHistory.json` の `ts` は使わない (state file の更新タイミングは task 完了/削除でも発火するため)
6. **新規メッセージサンプリング**: 先頭 100 + 末尾 100 (合計 200 メッセージ相当)、中間は `(... N messages truncated ...)` マーカー
7. **stderr 書式**: `⚠ Skipped (<taskId>): <reason>` (basename のみ、絶対パス禁止)

## Future ticket candidates (out of scope for KNOW-310 v0.1.0)

- `context_history.json` を活用した context graph 拡張
- VS Code Insiders / Cursor / Windsurf の Cline 拡張対応 (`CLINE_STORAGE_PATH` で部分的に回避可)
- streaming JSON parser (50MB 超対応、現状 10MB で skip)
- `taskHistory.json` の `conversationHistoryDeletedRange` を尊重した部分削除追跡
- parent/child task 因果関係の `note_links` 自動生成 (Cline には現在 explicit な parent/child フィールドはなく、`new_task` tool 経由の暗黙的関係)

## Update protocol

Cline major version (4.x など) リリース時:

1. fixtures をその tag で再取得
2. `extractTextContent` / `parseClineTask` の単体テストを追加 fixture で実行
3. drift があれば、本ドキュメントの **Pinned Cline version** を更新し、AC を再評価
