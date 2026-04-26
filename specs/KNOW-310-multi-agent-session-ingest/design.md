# Design: cline-sessions ingest plugin

## Ticket ID

KNOW-310

## Architecture Overview

```
┌──────────────────┐         ┌────────────────────────────┐
│  knowledgine CLI │  --source cline-sessions             │
│  ingest --source │ ───────▶│  ClineSessionsPlugin       │
└──────────────────┘         │  (packages/ingest/src/     │
                             │   plugins/cline-sessions/) │
                             └─────────────┬──────────────┘
                                           │
                ┌──────────────────────────┼──────────────────────┐
                │                          │                      │
                ▼                          ▼                      ▼
   getClineStorageDir()      parseClineTask()           sanitizeContent()
   (storage-locator.ts)      (session-parser.ts)        (shared/normalizer)
        │                          │
        │                          ▼
        │             readTaskHistory(state/taskHistory.json)
        │             (HistoryItem[] from shared cache)
        ▼
   <globalStorage>/saoudrizwan.claude-dev/
   ├── state/taskHistory.json     (HistoryItem[] index)
   └── tasks/<taskId>/
       ├── api_conversation_history.json   (主)
       ├── ui_messages.json                (フォールバック)
       └── task_metadata.json              (副次)
```

新規プラグインは `cursor-sessions` (OS パス + graceful skip) と `claude-sessions` (1 セッション=1 要約イベント) のハイブリッド設計。decision-detector / extractTextContent は今 PR で `packages/ingest/src/shared/` に昇格して両プラグインから共有する。

## Interface Definitions

### Plugin entry (`index.ts`)

```typescript
export class ClineSessionsPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "cline-sessions",
    name: "Cline Sessions",
    version: "0.1.0",
    schemes: ["cline-session://"],
    priority: 1,
  };

  readonly triggers: TriggerConfig[] = [{ type: "manual" }];

  async initialize(_config?: PluginConfig): Promise<PluginInitResult> {
    // CLINE_STORAGE_PATH が設定されていてパス不在なら stderr 警告 (戻り値は常に ok:true)
    return { ok: true };
  }

  async *ingestAll(sourceUri: SourceURI): AsyncGenerator<NormalizedEvent>;
  async *ingestIncremental(
    sourceUri: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent>;
  async getCurrentCheckpoint(sourceUri: SourceURI): Promise<string>;
  async dispose(): Promise<void> {}
}
```

### Storage locator (`storage-locator.ts`)

```typescript
export function getClineStorageDir(): string;
//   1. process.env.CLINE_STORAGE_PATH (絶対パス必須、symlink 解決) を優先
//   2. OS 別 default path

export function computeStorageHash(storageDir: string): string;
//   sha256(storageDir).hex.slice(0, 8) — sourceUri 衝突回避用
```

### Parser (`session-parser.ts`)

```typescript
export interface ClineNormalizedMessage {
  role: "user" | "assistant";
  timestamp: Date;
  content: string;
}

export interface ParseResult {
  messages: ClineNormalizedMessage[];
  skipReason?: string; // 存在すれば呼び出し元が stderr 警告
}

export async function parseClineTask(taskDir: string): Promise<ParseResult>;
//   優先: api_conversation_history.json (Anthropic.MessageParam[])
//   フォールバック: ui_messages.json (ClineMessage[] → 簡易抽出)
//   どちらも失敗 → { messages: [], skipReason: "..." }
//   10MB 超 → { messages: [], skipReason: "file too large (>10MB)" }

export async function readTaskHistory(storageDir: string): Promise<HistoryItem[]>;
//   state/taskHistory.json を読む。失敗時は空配列 (skip ではなく続行)
```

### Types (`types.ts`)

```typescript
// HistoryItem (state/taskHistory.json) - ingest plugin 利用分のみ
export interface ClineHistoryItem {
  id: string;
  ulid?: string;
  ts: number; // unix ms
  task: string; // ユーザープロンプト全文
  tokensIn?: number;
  tokensOut?: number;
  totalCost?: number;
  size?: number;
  cwdOnTaskInitialization?: string;
  modelId?: string;
}

// Anthropic.MessageParam の手書き型ガード (Zod 不使用)
export interface ClineApiMessage {
  role: "user" | "assistant" | string;
  content: string | Array<{ type: string; text?: string; [k: string]: unknown }>;
}

export function isClineApiMessage(x: unknown): x is ClineApiMessage;
export function isClineHistoryItem(x: unknown): x is ClineHistoryItem;
```

### Shared utilities (新規昇格)

```typescript
// packages/ingest/src/shared/decision-detector.ts (旧 plugins/claude-sessions/decision-detector.ts)
export function isDecisionPoint(content: string): boolean;

// packages/ingest/src/shared/text-extractor.ts (旧 plugins/claude-sessions/session-parser.ts:extractTextContent)
export function extractTextContent(content: unknown): string;
```

## Data Flow

### `ingestAll(sourceUri)`

1. `storageDir = sourceUri || getClineStorageDir()`
2. `storageHash = computeStorageHash(storageDir)`
3. `historyMap = await readTaskHistoryAsMap(storageDir)` — `Map<taskId, HistoryItem>` (失敗時は空 Map)
4. `taskIds = await findTaskIds(storageDir)` — `<storageDir>/tasks/` 直下のディレクトリ一覧 (不在で空配列)
5. for each taskId:
   - `event = await processTask(taskId, storageDir, storageHash, historyMap.get(taskId))`
   - `if (event) yield event`

### `processTask(taskId, storageDir, storageHash, historyItem?)`

1. `taskDir = join(storageDir, "tasks", taskId)`
2. `result = await parseClineTask(taskDir)`
3. if `result.skipReason`: stderr 警告 → return null
4. if `result.messages.length === 0`: return null (silent skip)
5. `summary = buildSummary(result.messages, historyItem)` — head 100 + tail 100
6. return `NormalizedEvent`:
   - `sourceUri: cline-session://${storageHash}/${taskId}`
   - `eventType: "capture"`
   - `title: "Cline: " + (historyItem?.task?.slice(0, 60).trim() || taskId.slice(0, 8))`
   - `content: sanitizeContent(summary)`
   - `timestamp: historyItem ? new Date(historyItem.ts) : firstMessage.timestamp`
   - `metadata`:
     - `sourcePlugin: "cline-sessions"`
     - `sourceId: taskId`
     - `tags: ["cline", "ai-session", historyItem?.cwdOnTaskInitialization ? \`cwd:\${basename(historyItem.cwdOnTaskInitialization)}\` : "cwd:unknown"]`
     - `extra`: `{ workspace, tokensIn, tokensOut, totalCost, size, messageCount, ulid? }`

### `ingestIncremental(sourceUri, checkpoint)`

1. `since = isNaN(new Date(checkpoint).getTime()) ? new Date(0) : new Date(checkpoint)`
2. for each taskId: `mtime = await maxMtime(taskDir, ["api_conversation_history.json", "ui_messages.json", "task_metadata.json"])`
3. if `mtime >= since.getTime()`: yield processTask result

### `getCurrentCheckpoint(sourceUri)`

1. 全タスクの max mtime (3 ファイル合計) を計算 (`Promise.all` で並列 stat)
2. 0 件なら `new Date(0).toISOString()`、それ以外は `new Date(maxMs).toISOString()`

## Key Design Decisions

### Decision 1: 1 タスク = 1 イベント、head 100 + tail 100

- **Chosen**: `processTask` で全メッセージから先頭 100 + 末尾 100 を抽出、中間は `(... N messages truncated ...)` マーカー
- **Alternatives considered**:
  - claude-sessions と同じ「先頭 200」 → Cline は長尺タスクが多く結論部 (末尾) が欠落
  - 1 メッセージ=1 イベント → events テーブル肥大、FTS 検索品質低下
  - 200 件 chunk 化 → イベント数過多、graph extraction の入力複雑化
- **Rationale**: Cline は `new_task` を呼ばない限り 1 タスクが数千メッセージになり得る。先頭 = タスク開始の文脈、末尾 = 結論/学びを保持。中間は `truncated` マーカーで省略を明示

### Decision 2: sourceUri に `storageHash8` を含める

- **Chosen**: `cline-session://${sha256(storageDir).slice(0,8)}/${taskId}`
- **Alternatives considered**:
  - `cline-session://${taskId}` (フラット) → 複数 VS Code (Stable / Insiders / Cursor / Windsurf) で同 task ID 衝突時に上書き
- **Rationale**: VS Code のフォーク多様化に備える。storage path のハッシュ 8 文字で実質衝突なし、人間にも storage 由来が明示される

### Decision 3: Decision-detector と extractTextContent を `shared/` に今 PR で昇格

- **Chosen**: 新規 `packages/ingest/src/shared/{decision-detector,text-extractor}.ts` を作成、`claude-sessions` の参照を書き換え、`cline-sessions` も同じ shared/ から import
- **Alternatives considered**:
  - `cline-sessions` が `../claude-sessions/decision-detector.js` を相対 import → プラグイン間結合、3 つ目で技術負債顕在化
  - 完全複製 → DRY 違反、`DECISION_PATTERNS` 更新が 2 箇所必要
- **Rationale**: 移動コスト約 0.15 人日。relative import を残すと cline-sessions マージ時点で既に負債化する。「3 プラグインまで待つ」では遅い

### Decision 4: SourceType に "cline" を追加 (core 1 行)

- **Chosen**: `packages/core/src/types.ts:193` の `SourceType` に `"cline"` を追加、`SOURCE_TYPE_MAP` で明示登録
- **Alternatives considered**:
  - `"manual"` フォールバック → events テーブルで AI session が manual と混在、UI 集計破綻
- **Rationale**: 1 行追加、core 影響最小。ソース別フィルタ・集計の意味論を保つ

### Decision 5: incremental checkpoint = タスク内 3 ファイルの max mtime

- **Chosen**: `Promise.all([stat(api), stat(ui), stat(metadata)])` の最大 `mtimeMs`
- **Alternatives considered**:
  - `task_metadata.json` のみ → context tracking 専用ファイルで会話更新を反映しない
  - `taskHistory.json` の `ts` → state file は task 完了/削除でも更新、incremental の意味が崩れる
- **Rationale**: 会話更新が確実に反映される。`task_metadata.json` は副次的に更新されるが mtime は会話と相関する

### Decision 6: defensive parsing は hand-rolled (Zod 不使用)

- **Chosen**: `isClineApiMessage` などの型ガードを 10 行程度で手書き、`ParseResult` 型で skip 理由を返す
- **Alternatives considered**: Zod スキーマ → 新規依存追加、cursor/claude-sessions と不整合
- **Rationale**: ingest パッケージは現在 zod 非依存。1 プラグインのために 50KB 増やす利益なし

### Decision 7: triggers は `[{ type: "manual" }]` のみ

- **Chosen**: file_watcher trigger を宣言しない
- **Alternatives considered**: claude-sessions / cursor-sessions と揃えて `file_watcher` 宣言
- **Rationale**: ランタイムで `manifest.triggers` を読む箇所は存在せず dead code。新規プラグインで dead code を増やさない

### Decision 8: `task_metadata.json` (FileContextTracker) は副次扱い

- **Chosen (v0.1.0)**: `task_metadata.json` は **incremental ingest の mtime 判定にのみ使用** する。`files_in_context` を `metadata.extra.relatedFiles` として取り込む処理は v0.1.0 では実装しない
- **Alternatives considered**:
  - 主データソースとして使用 → 名前から想像される「タスク基本情報」ではなく context tracking ファイルだったため誤解
  - `files_in_context.map(f => f.path)` を `metadata.extra.relatedFiles` に格納 → graph extraction の入力として有用ではあるが、v0.1.0 のスコープを膨らませる
- **Rationale**: 主データは `taskHistory.json` (HistoryItem) と `api_conversation_history.json` で完結する。`relatedFiles` 抽出は graph extraction 拡張と一緒に別チケットで対応するほうが Driver 単位として綺麗
- **Future work**: `metadata.extra.relatedFiles` 抽出は別チケット (`context_history.json` 活用と合わせた context graph 拡張) で対応

### Decision 9: stderr 書式 = `⚠ Skipped (<basename>): <reason>` 固定

- **Chosen**: `process.stderr.write(\`⚠ Skipped (\${basename(taskDir)}): \${reason}\\n\`)`
- **Alternatives considered**: 絶対パス出力 → `$HOME` 漏洩リスク
- **Rationale**: テストで文字列一致検証可能、デバッグ可能性と機密性のバランス

### Decision 10: 10MB 超ファイルは skip (Known Limitation)

- **Chosen**: `parseClineTask` 先頭で `stat` し 10MB 超なら `{ messages: [], skipReason: "file too large (>10MB)" }` 返却
- **Alternatives considered**: streaming parse → 実装複雑度大
- **Rationale**: Node の `JSON.parse` は文字列全体をメモリに乗せる。Cline 長期タスクは 50MB 超もあり得るため、Node ヒープ保護のため早期 skip

## Migration Strategy

N/A — 新規プラグイン追加のみ。既存 events/notes に影響なし。

## Security Considerations

- **path traversal**: `CLINE_STORAGE_PATH` は `isAbsolute` 検証 + `realpath` で symlink 解決
- **secret leak**: 全イベント content は `sanitizeContent` を通す。fixtures に合成 `sk-ant-api03-` トークン (40 字以上) を含めて redaction を CI で常時検証
- **stderr 漏洩**: 絶対パス禁止、`basename(taskDir)` のみ
- **Windows ファイルロック**: `EBUSY` / `EPERM` を catch して skip
- **JSON 破損**: try/catch で `skipReason` に格納、プロセス継続

## Testing Strategy

- **Unit tests**:
  - `storage-locator.test.ts` — OS 分岐、env override、絶対パス検証、symlink 解決、空文字列無視、`APPDATA` 未設定 fallback、`computeStorageHash` 確定性
  - `session-parser.test.ts` — api 優先 / ui フォールバック / 両方失敗 / unknown_future_field tolerance / 10MB 超 skip / `readTaskHistory` 不在許容
  - `cline-sessions-plugin.test.ts` — manifest, triggers, ingestAll (0 件 / 1 件), ingestIncremental (mtime フィルタ + Invalid Date fallback), graceful skip with stderr assertion, sanitization end-to-end, sourceUri に storageHash 含む, title に historyItem.task, dispose
- **Integration tests**: vitest の tmp dir に sample-task fixture をコピーして CLI 経由で動作確認 (Phase 5 手動検証で代替)
- **Edge cases**: 上記 unit にすべて含む

## Dependencies

- New dependencies: なし
- Modified packages:
  - `@knowledgine/core` (`SourceType` に `"cline"` 追加、1 行)
  - `@knowledgine/ingest` (新プラグイン、shared/ 昇格、SOURCE_TYPE_MAP)
  - `@knowledgine/cli` (plugin-loader、ingest コマンド、skill template、README、CHANGELOG)
