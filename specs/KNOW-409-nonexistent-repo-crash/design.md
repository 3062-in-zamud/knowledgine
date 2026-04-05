# KNOW-409 Design

## Overview

- GitHub plugin の repo preflight で repo-not-found を即座に friendly error へ変換する。
- CLI 最上位 catch でも defensive に repo-not-found を再判定して、生の GraphQL 文言を握りつぶす。

## Interfaces

- `isRepositoryNotFoundError(error: unknown): boolean`
- `createRepositoryNotFoundError(owner: string, repo: string): Error`

## Data Flow

1. `GitHubPlugin.ingestAll()` / `ingestIncremental()` が `fetchRepoMeta(owner, repo)` を呼ぶ。
2. preflight 失敗時に repo-not-found なら friendly error を throw する。
3. それ以外の preflight failure は従来どおり通常フローへフォールバックする。
4. `ingestCommand()` の catch で repo-not-found を検出したら 3 行メッセージへ変換する。

## Design Decisions

- 追加の `gh repo view` 呼び出しは入れず、既存 `fetchRepoMeta()` の preflight だけで判定する。
- not found 判定は GraphQL 文言と REST 系 `repository not found` / `not found` を許容する。
- CLI では `Ingest failed:` 接頭辞を付けず、ユーザー向けメッセージだけを表示する。
