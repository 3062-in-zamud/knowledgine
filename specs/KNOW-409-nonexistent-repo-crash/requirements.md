# KNOW-409: 存在しない GitHub リポジトリ指定でのクラッシュ修正

## Problem Statement
- `knowledgine ingest --source github --repo owner/repo` に存在しないリポジトリを渡すと、`gh` の GraphQL / REST 生エラーがそのまま CLI に露出する。
- ユーザー向けには「repo not found」と修正方法だけを出すべきで、内部エラー文言をそのまま見せるべきではない。

## Acceptance Criteria
- 存在しない GitHub リポジトリでは、CLI が次の趣旨のメッセージを表示して終了する。
  - `Repository 'owner/repo' not found.`
  - `Check the repository name and ensure it exists on GitHub.`
  - `Usage: knowledgine ingest --source github --repo owner/repo`
- GraphQL の `Could not resolve to a Repository` が直接表示されない。
- exit code `1` は維持する。
- 正常な GitHub ingest と KNOW-395 の has_issues preflight は壊さない。

## Constraints
- P1 のため最小修正にとどめる。
- 既存の `gh` retry / pagination / issue-disabled ロジックは変更しない。

## Affected Packages
- `packages/ingest`
- `packages/cli`

## Out of Scope
- GitHub 以外の plugin のエラー整形
- 新しい CLI オプションの追加
