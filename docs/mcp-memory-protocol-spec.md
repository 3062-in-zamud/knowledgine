# MCP Memory Protocol Specification

## Status

Draft

## Authors

- Knowledgine Team

---

## 1. Abstract

MCP Memory Protocol（以下、本仕様）は、Model Context Protocol（MCP）のツール拡張として、AIアシスタントが永続的なメモリを管理するための標準インターフェースを定義する。本仕様は4つの基本操作（`store_memory`、`recall_memory`、`update_memory`、`forget_memory`）を規定し、エピソード記憶・意味記憶・手続き記憶の3層モデルによるメモリライフサイクル管理、バージョンチェーンによるイミュータブルな更新履歴、および特定時点のメモリ状態を復元するPoint-in-Timeクエリをサポートする。

---

## 2. Introduction

### 2.1 Motivation

LLMはステートレスなアーキテクチャを持つため、会話セッションをまたいで知識を保持することができない。開発者向けのAIアシスタントが扱うメモリは、一般的なユーザーデータとは異なる特性を持つ。具体的には、コードの設計判断、デバッグで得た知見、ライブラリの使用経験といった「手続き的知識」が中心であり、これらは時間の経過に伴って更新・陳腐化する。

さらに、Claude Code、Cursor、Windsurf などの開発支援ツールは各々独自のメモリ実装を持ち、相互運用性が存在しない。ツールを切り替えるたびにコンテキストが失われ、開発者は同じ説明を繰り返す必要がある。

本仕様は以下の課題を解決することを目的とする。

- LLMのステートレス性に起因する文脈喪失
- 開発者メモリの特殊性（コード知識、デバッグ経験、設計判断）に対応したメモリモデルの欠如
- 既存メモリシステム間の相互運用性の欠如

### 2.2 Design Goals

1. **シンプルさ**: 4操作（store/recall/update/forget）で完結し、学習コストを最小化する
2. **拡張性**: Capability Negotiationにより、実装ごとにオプション機能を宣言できる
3. **互換性**: 既存MCP仕様（2024-11-05）のツール登録パターンと完全互換を保つ
4. **プロバイダー非依存**: SQLite、PostgreSQL、インメモリ等、任意のバックエンドで実装可能とする

### 2.3 Relationship to MCP Specification

本仕様はMCP仕様のツールレベル拡張として定義する。新しいMCPプリミティブ（Resources、Prompts等）は導入しない。既存の `tools/list` および `tools/call` メッセージを通じて動作し、既存の `resources`、`prompts` との共存を前提とする。

---

## 3. Terminology

本仕様で使用するキーワード「MUST」「MUST NOT」「REQUIRED」「SHALL」「SHALL NOT」「SHOULD」「SHOULD NOT」「RECOMMENDED」「MAY」「OPTIONAL」は RFC 2119 に従って解釈する。

| 用語                     | 定義                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Memory Entry**         | メモリシステムに格納された単一の知識単位。一意のIDを持ち、コンテンツ・メタデータ・バージョン情報を含む |
| **Memory Layer**         | メモリの保持期間・重要度を表す分類。`episodic`（短期）、`semantic`（中期）、`procedural`（長期）の3種  |
| **Layer Promotion**      | アクセス頻度に基づき、Memory Entryをより長期の層へ昇格させる操作                                       |
| **Version Chain**        | `supersedes` フィールドで連結されたMemory Entryの系列。更新履歴を表す                                  |
| **Point-in-Time Recall** | 指定した過去の時点で有効だったMemory Entryを返す機能                                                   |
| **Capability**           | サーバーが実装するオプション機能の識別子                                                               |
| **Soft Forget**          | Memory EntryをDeprecated状態にマークする操作。物理削除せず復元可能                                     |
| **Hard Forget**          | Memory Entryを物理削除する操作。復元不可                                                               |
| **validFrom**            | そのバージョンのMemory Entryが有効になった時点のISO 8601タイムスタンプ                                 |
| **deprecated**           | そのMemory Entryが無効化（論理削除）されたことを示すフラグ                                             |

---

## 4. Protocol Overview

### 4.1 Memory Model

本仕様は3層のメモリモデルを採用する。

| 層             | 識別子       | 概念     | 保持特性                                                           |
| -------------- | ------------ | -------- | ------------------------------------------------------------------ |
| エピソード記憶 | `episodic`   | 短期記憶 | 最近のイベント、一時的な文脈。アクセス頻度が低ければ自然に埋もれる |
| 意味記憶       | `semantic`   | 中期記憶 | 繰り返しアクセスされた知識、概念的理解                             |
| 手続き記憶     | `procedural` | 長期記憶 | コーディングパターン、設計原則、定着したノウハウ                   |

各Memory Entryは作成時にいずれかの層に属する。実装はLayer Promotionをサポートすることで（Capability: `layer_promotion`）、アクセスカウントに基づく自動昇格を提供してもよい。

**昇格閾値の参考値（実装依存）:**

- `episodic` → `semantic`: アクセスカウント 3以上
- `semantic` → `procedural`: アクセスカウント 10以上

### 4.2 Memory Lifecycle

```
store_memory
    │
    ▼
[Memory Entry: layer=episodic]
    │
    ├─ recall_memory (accessCount++)
    │       │
    │       └─ [Layer Promotion: optional]
    │               episodic → semantic → procedural
    │
    ├─ update_memory (createVersion=true)
    │       │
    │       ├─ 旧エントリ: deprecated=true
    │       └─ 新エントリ: 新IDで作成、supersedes=旧ID
    │
    └─ forget_memory
            ├─ soft: deprecated=true（復元可能）
            └─ hard: 物理削除（復元不可）
```

### 4.3 Versioning Model

本仕様はイミュータブルな更新モデルを採用する。

- `update_memory` が呼ばれると、デフォルトで新しいMemory Entryが作成される（`createVersion: true`）
- 旧エントリは `deprecated: true` にマークされ、新エントリの `supersedes` フィールドに旧エントリのIDが格納される
- `createVersion: false` を指定した場合、既存エントリをインプレース更新する（バージョン履歴は保持されない）
- バージョン番号は1から始まり、更新のたびに1ずつ増加する

---

## 5. Operations

### 5.1 store_memory

新しいMemory Entryを作成してメモリシステムに格納する。

**入力スキーマ:**

| フィールド | 型                                         | 必須     | 説明                                                  |
| ---------- | ------------------------------------------ | -------- | ----------------------------------------------------- |
| `content`  | `string`                                   | REQUIRED | 格納するメモリの本文。空文字列はINVALID_CONTENTエラー |
| `layer`    | `"episodic" \| "semantic" \| "procedural"` | OPTIONAL | 格納先の層（デフォルト: `"episodic"`）                |
| `metadata` | `MemoryMetadata`                           | OPTIONAL | 任意のメタデータ（Section 6.2参照）                   |
| `tags`     | `string[]`                                 | OPTIONAL | 分類用タグ                                            |
| `ttl`      | `number`                                   | OPTIONAL | 有効期限（秒）。実装がサポートする場合に有効          |

**出力スキーマ:**

| フィールド  | 型       | 必須     | 説明                       |
| ----------- | -------- | -------- | -------------------------- |
| `id`        | `string` | REQUIRED | 作成されたMemory EntryのID |
| `layer`     | `string` | REQUIRED | 格納された層               |
| `version`   | `number` | REQUIRED | バージョン番号（常に1）    |
| `createdAt` | `string` | REQUIRED | 作成日時（ISO 8601）       |

**エラーコード:**

| コード            | 説明                           |
| ----------------- | ------------------------------ |
| `INVALID_CONTENT` | `content` が空文字列またはnull |
| `INVALID_LAYER`   | `layer` に不正な値が指定された |
| `STORAGE_ERROR`   | バックエンドでの格納に失敗     |

### 5.2 recall_memory

条件に合致するMemory Entryを取得する。`query` を省略した場合は最近アクセスされたエントリを返す。実装は取得時に `accessCount` をインクリメントすべきである（SHOULD）。

**入力スキーマ:**

| フィールド              | 型             | 必須     | 説明                                                                          |
| ----------------------- | -------------- | -------- | ----------------------------------------------------------------------------- |
| `query`                 | `string`       | OPTIONAL | 全文検索クエリ。省略時は最新エントリを返す                                    |
| `filter`                | `RecallFilter` | OPTIONAL | 絞り込み条件（Section 6.3参照）                                               |
| `limit`                 | `number`       | OPTIONAL | 最大取得件数（デフォルト: 10、最大: 100）                                     |
| `asOf`                  | `string`       | OPTIONAL | Point-in-Timeクエリの基準時刻（ISO 8601）。Capability `temporal_query` が必要 |
| `includeVersionHistory` | `boolean`      | OPTIONAL | 非推奨バージョンを含めるか（デフォルト: `false`）                             |

**RecallFilter:**

| フィールド      | 型         | 必須     | 説明                                             |
| --------------- | ---------- | -------- | ------------------------------------------------ |
| `layer`         | `string`   | OPTIONAL | 取得する層の絞り込み                             |
| `tags`          | `string[]` | OPTIONAL | タグによる絞り込み（AND条件）                    |
| `createdAfter`  | `string`   | OPTIONAL | この日時以降に作成されたエントリのみ（ISO 8601） |
| `createdBefore` | `string`   | OPTIONAL | この日時以前に作成されたエントリのみ（ISO 8601） |
| `memoryIds`     | `string[]` | OPTIONAL | 取得するエントリIDの明示的な指定                 |

**出力スキーマ:**

| フィールド   | 型                 | 必須     | 説明                                          |
| ------------ | ------------------ | -------- | --------------------------------------------- |
| `memories`   | `RecalledMemory[]` | REQUIRED | 取得されたMemory Entryの配列                  |
| `totalCount` | `number`           | REQUIRED | フィルター条件に合致する全件数                |
| `hasMore`    | `boolean`          | REQUIRED | `limit` で切り捨てられた件数がある場合 `true` |

**RecalledMemory:**

| フィールド       | 型               | 必須     | 説明                                                                                  |
| ---------------- | ---------------- | -------- | ------------------------------------------------------------------------------------- |
| `id`             | `string`         | REQUIRED | Memory EntryのID                                                                      |
| `content`        | `string`         | REQUIRED | メモリの本文                                                                          |
| `summary`        | `string`         | OPTIONAL | 要約文                                                                                |
| `layer`          | `string`         | REQUIRED | 属する層                                                                              |
| `version`        | `number`         | REQUIRED | バージョン番号                                                                        |
| `relevanceScore` | `number`         | OPTIONAL | クエリに対する関連度スコア（0.0〜1.0）。Capability `semantic_search` の場合に返される |
| `accessCount`    | `number`         | REQUIRED | 累計アクセス回数                                                                      |
| `tags`           | `string[]`       | REQUIRED | タグ（未設定の場合は空配列）                                                          |
| `metadata`       | `MemoryMetadata` | OPTIONAL | メタデータ                                                                            |
| `createdAt`      | `string`         | REQUIRED | 作成日時（ISO 8601）                                                                  |
| `updatedAt`      | `string`         | OPTIONAL | 最終更新日時（ISO 8601）                                                              |
| `lastAccessedAt` | `string`         | OPTIONAL | 最終アクセス日時（ISO 8601）                                                          |

**副作用:** 取得されたエントリの `accessCount` をインクリメントすべきである（SHOULD）。実装は `accessCount` インクリメントをトランザクション内で安全に実行しなければならない（MUST）。

### 5.3 update_memory

既存のMemory Entryを更新する。`createVersion: true`（デフォルト）の場合、新しいバージョンが作成されてイミュータブルな更新履歴が維持される。

**入力スキーマ:**

| フィールド      | 型                        | 必須     | 説明                                           |
| --------------- | ------------------------- | -------- | ---------------------------------------------- |
| `id`            | `string`                  | REQUIRED | 更新するMemory EntryのID                       |
| `content`       | `string`                  | OPTIONAL | 新しい本文                                     |
| `summary`       | `string`                  | OPTIONAL | 新しい要約文                                   |
| `tags`          | `string[]`                | OPTIONAL | 置き換えるタグ配列                             |
| `metadata`      | `Partial<MemoryMetadata>` | OPTIONAL | マージするメタデータ                           |
| `createVersion` | `boolean`                 | OPTIONAL | 新バージョンを作成するか（デフォルト: `true`） |

**出力スキーマ:**

| フィールド        | 型       | 必須     | 説明                                                               |
| ----------------- | -------- | -------- | ------------------------------------------------------------------ |
| `id`              | `string` | REQUIRED | 更新後のMemory EntryのID（`createVersion: true` の場合は新しいID） |
| `version`         | `number` | REQUIRED | 更新後のバージョン番号                                             |
| `previousVersion` | `number` | OPTIONAL | 更新前のバージョン番号（`createVersion: true` の場合に含まれる）   |
| `updatedAt`       | `string` | REQUIRED | 更新日時（ISO 8601）                                               |

**エラーコード:**

| コード             | 説明                             |
| ------------------ | -------------------------------- |
| `MEMORY_NOT_FOUND` | 指定IDのMemory Entryが存在しない |
| `VERSION_CONFLICT` | 同時更新による競合が発生した     |

### 5.4 forget_memory

Memory Entryをメモリシステムから削除または無効化する。

**入力スキーマ:**

| フィールド | 型        | 必須     | 説明                                    |
| ---------- | --------- | -------- | --------------------------------------- |
| `id`       | `string`  | REQUIRED | 削除するMemory EntryのID                |
| `reason`   | `string`  | OPTIONAL | 削除理由（監査ログ用）                  |
| `hard`     | `boolean` | OPTIONAL | 物理削除を行うか（デフォルト: `false`） |

**出力スキーマ:**

| フィールド  | 型                 | 必須     | 説明                       |
| ----------- | ------------------ | -------- | -------------------------- |
| `id`        | `string`           | REQUIRED | 操作対象のMemory EntryのID |
| `forgotten` | `boolean`          | REQUIRED | 操作が成功した場合 `true`  |
| `method`    | `"soft" \| "hard"` | REQUIRED | 実行された削除方式         |

**削除方式の詳細:**

- **Soft Forget** (`hard: false`): `deprecated: true` をセットし、`deprecationReason` に `reason` を格納する。エントリは物理的に残り、`recall_memory(includeVersionHistory: true)` で参照可能
- **Hard Forget** (`hard: true`): エントリを物理削除する。復元は不可能

**エラーコード:**

| コード             | 説明                             |
| ------------------ | -------------------------------- |
| `MEMORY_NOT_FOUND` | 指定IDのMemory Entryが存在しない |

---

## 6. Data Types

### 6.1 MemoryEntry

Memory Entryは以下のフィールドを持つ。

| フィールド          | 型                                         | 説明                                     |
| ------------------- | ------------------------------------------ | ---------------------------------------- |
| `id`                | `string`                                   | エントリの一意識別子                     |
| `layer`             | `"episodic" \| "semantic" \| "procedural"` | 属する層                                 |
| `content`           | `string`                                   | メモリの本文（必須、空不可）             |
| `summary`           | `string \| null`                           | 本文の要約                               |
| `accessCount`       | `number`                                   | 累計アクセス回数（非負整数）             |
| `lastAccessedAt`    | `string \| null`                           | 最終アクセス日時（ISO 8601）             |
| `tags`              | `string[]`                                 | 分類タグ                                 |
| `metadata`          | `MemoryMetadata \| null`                   | 拡張メタデータ                           |
| `createdAt`         | `string`                                   | 作成日時（ISO 8601）                     |
| `updatedAt`         | `string \| null`                           | 最終更新日時（ISO 8601）                 |
| `version`           | `number`                                   | バージョン番号（1始まり）                |
| `supersedes`        | `string \| null`                           | 前バージョンのID（Version Chain）        |
| `validFrom`         | `string \| null`                           | このバージョンの有効開始日時（ISO 8601） |
| `deprecated`        | `boolean`                                  | 無効化フラグ                             |
| `deprecationReason` | `string \| null`                           | 無効化の理由                             |

### 6.2 MemoryMetadata

`MemoryMetadata` は実装が独自に拡張可能なオープンな型である。

| フィールド      | 型               | 説明                                                          |
| --------------- | ---------------- | ------------------------------------------------------------- |
| `source`        | `string \| null` | メモリの作成元（例: `"claude_code"`、`"cursor"`、`"manual"`） |
| `project`       | `string \| null` | 関連プロジェクトの識別子                                      |
| `sessionId`     | `string \| null` | 作成時のセッションID                                          |
| `confidence`    | `number \| null` | 情報の信頼度（0.0〜1.0）                                      |
| `[key: string]` | `unknown`        | 実装が追加する任意のフィールド                                |

### 6.3 RecallFilter

Section 5.2 の `filter` パラメータで使用する絞り込み条件型。定義は Section 5.2 を参照。

### 6.4 VersionInfo

バージョン情報の要約型。Version Chain参照時に使用する。

| フィールド          | 型               | 説明                             |
| ------------------- | ---------------- | -------------------------------- |
| `version`           | `number`         | バージョン番号                   |
| `id`                | `string`         | このバージョンのMemory EntryのID |
| `supersedes`        | `string \| null` | 前バージョンのID                 |
| `validFrom`         | `string`         | 有効開始日時（ISO 8601）         |
| `deprecated`        | `boolean`        | 無効化フラグ                     |
| `deprecationReason` | `string \| null` | 無効化の理由                     |

---

## 7. Error Handling

### 7.1 Error Codes

実装はMCP仕様のエラーレスポンス形式に準拠しなければならない（MUST）。本仕様で定義する標準エラーコードは以下の通り。

| エラーコード               | HTTPアナログ | 説明                                       |
| -------------------------- | ------------ | ------------------------------------------ |
| `MEMORY_NOT_FOUND`         | 404          | 指定IDのMemory Entryが存在しない           |
| `INVALID_CONTENT`          | 400          | `content` が空文字列またはnull             |
| `INVALID_LAYER`            | 400          | `layer` に未定義の値が指定された           |
| `INVALID_PARAMETER`        | 400          | その他のパラメータ検証エラー               |
| `VERSION_CONFLICT`         | 409          | 同時更新による競合                         |
| `STORAGE_ERROR`            | 500          | バックエンドでの永続化エラー               |
| `CAPABILITY_NOT_SUPPORTED` | 501          | 要求された機能がサーバーに実装されていない |

### 7.2 Error Response Format

MCP標準のツールエラーレスポンス形式に準拠する。

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "MEMORY_NOT_FOUND: Memory entry with id='abc123' does not exist"
    }
  ]
}
```

エラーメッセージは `<ERROR_CODE>: <human-readable description>` の形式で記述することを推奨する（RECOMMENDED）。

---

## 8. Versioning Protocol

### 8.1 Version Chain

`update_memory(createVersion: true)` を呼び出すと、以下の操作がアトミックに実行されなければならない（MUST）。

1. 既存のMemory Entryの `deprecated` フラグを `true` にセットし、`deprecationReason` を更新理由で記録する
2. 新しいMemory Entryを作成し、`supersedes` フィールドに旧エントリのIDをセットする
3. 新エントリの `validFrom` を現在時刻（ISO 8601）にセットする
4. 新エントリの `version` を旧エントリの `version + 1` にセットする

Version Chainの模式図:

```
[Entry v1: id="a1", deprecated=true]
        ↑ supersedes
[Entry v2: id="a2", deprecated=true]
        ↑ supersedes
[Entry v3: id="a3", deprecated=false]  ← 現在の最新バージョン
```

### 8.2 Point-in-Time Recall

`recall_memory` に `asOf` パラメータを指定すると、指定時点で有効だったバージョンのMemory Entryが返される。Capability `temporal_query` の宣言が必要である。

**フィルタリングロジック（実装MUST）:**

1. `validFrom <= asOf` のエントリを候補として選択する
2. 候補の中から、`deprecated: true` かつそのエントリが `deprecated` になった時刻が `asOf` より後のものを含める（`asOf` 時点ではまだ有効だったため）
3. `deprecated: false` のエントリは常に含める（ただし `validFrom` 条件を満たすもの）
4. 同一のVersion Chainから複数のバージョンが候補となる場合、`asOf` 時点で有効だった最新バージョンを1件のみ返す

---

## 9. Capability Negotiation

### 9.1 Required Capabilities

以下の4操作はすべての準拠実装が実装しなければならない（MUST）。

- `store_memory`
- `recall_memory`（`asOf` および `includeVersionHistory` パラメータなし）
- `update_memory`（`createVersion: false` のインプレース更新のみ）
- `forget_memory`

### 9.2 Optional Capabilities

実装はオプション機能を Capability として宣言してもよい（MAY）。クライアントはサーバーの Capability を確認してから該当機能を使用すべきである（SHOULD）。

| Capability        | 説明                               | 関連パラメータ                                                                     |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| `versioning`      | Version Chainとイミュータブル更新  | `update_memory(createVersion: true)`、`recall_memory(includeVersionHistory: true)` |
| `semantic_search` | クエリベースの関連度スコア付き検索 | `recall_memory` の `relevanceScore` フィールド                                     |
| `layer_promotion` | アクセスカウントに基づく自動層昇格 | （内部動作、APIパラメータなし）                                                    |
| `temporal_query`  | Point-in-Time Recall               | `recall_memory(asOf: ...)`                                                         |
| `ttl`             | Memory Entryの有効期限管理         | `store_memory(ttl: ...)`                                                           |

### 9.3 Capability Discovery

Capability の公開方法はMCPのツールメタデータ（`description` フィールド等）を通じて行う。本仕様では専用のCapability Discoveryエンドポイントを定義しない。実装は `get_memory_capabilities` 等の補助ツールを追加してもよい（MAY）。

---

## 10. Security Considerations

### 10.1 データ保護

- 機密情報を含むMemory Entryは保存時に暗号化すべきである（SHOULD）
- `metadata.source` フィールドを利用して、メモリの作成元クライアントを追跡できる

### 10.2 アクセス制御

- 実装は `metadata.project` フィールドによるプロジェクトスコープのメモリ分離をサポートすることを推奨する（RECOMMENDED）
- 異なるプロジェクト間でのメモリのクロスアクセスを防ぐべきである（SHOULD）
- MCPサーバーはOAuth等の標準認証メカニズムと組み合わせることができる（MAY）

### 10.3 Hard Forget の取り扱い

- `hard: true` の削除操作は不可逆であるため、実装は操作確認や監査ログの記録を検討すべきである（SHOULD）
- デフォルトを `hard: false`（Soft Forget）とすることで、誤操作からの復元パスを確保する

### 10.4 自動削除

- `ttl` Capabilityをサポートする実装では、期限切れエントリの削除前にSoft Forgetを経由することを推奨する（RECOMMENDED）

---

## 11. Conformance Requirements

### 11.1 MUSTレベル（必須要件）

準拠実装は以下をすべて満たさなければならない（MUST）。

- `store_memory`、`recall_memory`（基本形）、`update_memory`（`createVersion: false`）、`forget_memory`（soft）の4操作を実装する
- `store_memory` の `content` が空の場合に `INVALID_CONTENT` エラーを返す
- `update_memory` および `forget_memory` で存在しないIDが指定された場合に `MEMORY_NOT_FOUND` エラーを返す
- Section 7.2 のエラーレスポンス形式に準拠する
- `versioning` Capabilityを宣言する場合、Version ChainのアトミックなINSERT/UPDATEを保証する（Section 8.1）
- `temporal_query` Capabilityを宣言する場合、Section 8.2 のPoint-in-Timeフィルタリングロジックを正確に実装する

### 11.2 SHOULDレベル（推奨要件）

準拠実装は以下を実装すべきである（SHOULD）。

- `recall_memory` 実行時に取得エントリの `accessCount` をインクリメントする
- エラーメッセージを `<ERROR_CODE>: <description>` 形式で返す
- `forget_memory` のデフォルトをSoft Forgetとする

### 11.3 MAYレベル（任意要件）

準拠実装は以下を実装してもよい（MAY）。

- Optional Capabilities（Section 9.2）を実装する
- `get_memory_capabilities` 等のCapability Discovery補助ツールを追加する
- `ttl` による自動削除機能を提供する

---

## 12. Examples

### 12.1 Basic Flow（store → recall → update → forget）

**1. メモリの格納:**

```json
// Request: store_memory
{
  "content": "TypeScriptのstrictモードでは、nullチェックを省略するとコンパイルエラーになる",
  "layer": "episodic",
  "tags": ["typescript", "strict-mode"],
  "metadata": {
    "source": "claude_code",
    "project": "knowledgine"
  }
}

// Response
{
  "id": "mem_01HXYZ123",
  "layer": "episodic",
  "version": 1,
  "createdAt": "2026-03-25T10:00:00Z"
}
```

**2. メモリの検索:**

```json
// Request: recall_memory
{
  "query": "TypeScript null check",
  "filter": { "layer": "episodic" },
  "limit": 5
}

// Response
{
  "memories": [
    {
      "id": "mem_01HXYZ123",
      "content": "TypeScriptのstrictモードでは、nullチェックを省略するとコンパイルエラーになる",
      "layer": "episodic",
      "version": 1,
      "accessCount": 1,
      "tags": ["typescript", "strict-mode"],
      "createdAt": "2026-03-25T10:00:00Z",
      "lastAccessedAt": "2026-03-25T10:05:00Z"
    }
  ],
  "totalCount": 1,
  "hasMore": false
}
```

**3. メモリの更新（バージョン作成）:**

```json
// Request: update_memory
{
  "id": "mem_01HXYZ123",
  "content": "TypeScriptのstrictモードでは、nullチェックを省略するとコンパイルエラーになる。exactOptionalPropertyTypesも有効にするとより厳密になる",
  "createVersion": true
}

// Response
{
  "id": "mem_01HXYZ456",
  "version": 2,
  "previousVersion": 1,
  "updatedAt": "2026-03-25T11:00:00Z"
}
```

**4. メモリの削除（Soft Forget）:**

```json
// Request: forget_memory
{
  "id": "mem_01HXYZ456",
  "reason": "プロジェクト終了のため不要",
  "hard": false
}

// Response
{
  "id": "mem_01HXYZ456",
  "forgotten": true,
  "method": "soft"
}
```

### 12.2 Version Chain Flow

```json
// Step 1: 初期格納
// store_memory → id="mem_v1", version=1

// Step 2: バージョン更新
// update_memory(id="mem_v1", createVersion=true)
// → 旧エントリ mem_v1: deprecated=true
// → 新エントリ mem_v2: version=2, supersedes="mem_v1"

// Step 3: さらに更新
// update_memory(id="mem_v2", createVersion=true)
// → 旧エントリ mem_v2: deprecated=true
// → 新エントリ mem_v3: version=3, supersedes="mem_v2"

// Step 4: Version Chain全体の取得
// recall_memory(filter={memoryIds: ["mem_v3"]}, includeVersionHistory=true)
// → mem_v1 (deprecated=true), mem_v2 (deprecated=true), mem_v3 (deprecated=false)
```

### 12.3 Temporal Recall Flow

```json
// 2026-03-01時点でのメモリ状態を復元する
// Request: recall_memory
{
  "query": "TypeScript strict",
  "asOf": "2026-03-01T00:00:00Z",
  "limit": 10
}

// このクエリは2026-03-01時点で有効だったバージョンを返す:
// - validFrom <= "2026-03-01T00:00:00Z" を満たすエントリ
// - 同一Version Chainからは "2026-03-01" 時点の最新バージョンを1件のみ返す
// - "2026-03-01" 以降に deprecated になったエントリも含む（当時は有効だったため）
```

---

## Appendix A: JSON Schema Definitions

### A.1 MemoryEntry Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "MemoryEntry",
  "type": "object",
  "required": [
    "id",
    "layer",
    "content",
    "accessCount",
    "tags",
    "createdAt",
    "version",
    "deprecated"
  ],
  "properties": {
    "id": { "type": "string" },
    "layer": { "type": "string", "enum": ["episodic", "semantic", "procedural"] },
    "content": { "type": "string", "minLength": 1 },
    "summary": { "type": ["string", "null"] },
    "accessCount": { "type": "integer", "minimum": 0 },
    "lastAccessedAt": { "type": ["string", "null"], "format": "date-time" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "metadata": { "oneOf": [{ "$ref": "#/$defs/MemoryMetadata" }, { "type": "null" }] },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": ["string", "null"], "format": "date-time" },
    "version": { "type": "integer", "minimum": 1 },
    "supersedes": { "type": ["string", "null"] },
    "validFrom": { "type": ["string", "null"], "format": "date-time" },
    "deprecated": { "type": "boolean" },
    "deprecationReason": { "type": ["string", "null"] }
  },
  "$defs": {
    "MemoryMetadata": {
      "type": "object",
      "properties": {
        "source": { "type": ["string", "null"] },
        "project": { "type": ["string", "null"] },
        "sessionId": { "type": ["string", "null"] },
        "confidence": { "type": ["number", "null"], "minimum": 0.0, "maximum": 1.0 }
      },
      "additionalProperties": true
    }
  }
}
```

### A.2 store_memory Input Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["content"],
  "properties": {
    "content": { "type": "string", "minLength": 1 },
    "layer": {
      "type": "string",
      "enum": ["episodic", "semantic", "procedural"],
      "default": "episodic"
    },
    "metadata": { "$ref": "MemoryEntry#/$defs/MemoryMetadata" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "ttl": { "type": "integer", "minimum": 1 }
  },
  "additionalProperties": false
}
```

### A.3 recall_memory Input Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "query": { "type": "string" },
    "filter": {
      "type": "object",
      "properties": {
        "layer": { "type": "string", "enum": ["episodic", "semantic", "procedural"] },
        "tags": { "type": "array", "items": { "type": "string" } },
        "createdAfter": { "type": "string", "format": "date-time" },
        "createdBefore": { "type": "string", "format": "date-time" },
        "memoryIds": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 10 },
    "asOf": { "type": "string", "format": "date-time" },
    "includeVersionHistory": { "type": "boolean", "default": false }
  },
  "additionalProperties": false
}
```

### A.4 update_memory Input Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" },
    "content": { "type": "string", "minLength": 1 },
    "summary": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "metadata": { "$ref": "MemoryEntry#/$defs/MemoryMetadata" },
    "createVersion": { "type": "boolean", "default": true }
  },
  "additionalProperties": false
}
```

### A.5 forget_memory Input Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "string" },
    "reason": { "type": "string" },
    "hard": { "type": "boolean", "default": false }
  },
  "additionalProperties": false
}
```

---

## Appendix B: Comparison with Existing Memory Systems

| Feature                 |                    MCP Memory Protocol |       Mem0 |        Zep |    Claude Memory |
| ----------------------- | -------------------------------------: | ---------: | ---------: | ---------------: |
| Open Standard           |                                    Yes |         No |         No |               No |
| Layer Model             | 3-layer (episodic/semantic/procedural) |       flat |     2-tier |             flat |
| Versioning              |                   Yes（Version Chain） |         No |    Partial |               No |
| Temporal Query          |                   Yes（Point-in-Time） |         No |         No |               No |
| Soft/Hard Delete        |                                   Both |  Hard only |  Soft only |        Hard only |
| Provider Agnostic       |                                    Yes | No（SaaS） | No（SaaS） | No（Claude専用） |
| MCP Native              |                                    Yes |         No |         No |               No |
| Access Count Tracking   |                                    Yes |         No |         No |               No |
| Contradiction Detection |             Out of scope (implementer) |         No |    Partial |               No |

**補足:** Contradiction Detection（矛盾検出）は本プロトコルのスコープ外であり、実装固有の拡張として実現する。Knowledgine の `ReflectorAgent` はその参照実装例である。

---

## Appendix C: Mapping to Knowledgine Implementation

本仕様の各操作と、Knowledgine の既存実装コンポーネントとのマッピングを示す。

| Protocol Operation         | Knowledgine Component | メソッド/機能                                      |
| -------------------------- | --------------------- | -------------------------------------------------- |
| `store_memory`             | `MemoryManager`       | `store(layer, content, noteId?, metadata?)`        |
| `recall_memory`（基本）    | `MemoryManager`       | `retrieve(layer, limit)` / `search(query, layer?)` |
| `recall_memory`（asOf）    | `TemporalQueryEngine` | `queryAsOf({ asOf })` の `noteVersions` フィールド |
| `update_memory`（inplace） | `MemoryManager`       | `update(id, { content?, summary?, metadata? })`    |
| `update_memory`（version） | `KnowledgeRepository` | `createNewVersion(noteId, data)`                   |
| `forget_memory`（soft）    | `KnowledgeRepository` | `deprecateNote(noteId, reason)`                    |
| `forget_memory`（hard）    | `MemoryManager`       | `remove(id)`                                       |
| Layer Promotion            | `MemoryManager`       | `promote(id)` / `demote(id)`                       |
| Version Chain取得          | `TemporalQueryEngine` | `getVersionChain(noteId)`                          |
| Entity Timeline            | `TemporalQueryEngine` | `getEntityTimeline(entityId)`                      |
| Contradiction Detection    | `ReflectorAgent`      | `reflect(observerOutput)`                          |
| 6-vector Classification    | `ObserverAgent`       | `observe(note)`                                    |
