# Requirements: cross-project search dynamic path resolution

## Ticket ID

KNOW-403

## Status

ready

## Problem Statement

`knowledgine search "query" --projects /abs/path/to/repo` は現状、
`.knowledginerc` に事前登録した name しか受け付けない。CLI ヘルプ・README で
この制約が明示されておらず、ユーザーは「`--projects` にパスを直接渡せる」と
誤解しやすい。ad-hoc な探索（過去調査リポ、CI 環境、新規 clone 直後）で
事前登録ステップが摩擦となる。

core 層 (`packages/core/src/search/cross-project-searcher.ts`) は既に
`ProjectEntry { name, path }` を入力として受け取り、内部で
`join(path, ".knowledgine", "index.sqlite")` を組み立て、不在は warning + skip、
schema_version >= 8 検証も持つ。**つまり既存 core ロジックは動的パス対応が
可能な構造をしているが、CLI 層 (`packages/cli/src/commands/search.ts:67-84`)
が rc 登録 name のみで filter している**ため CLI 経由では使えない。

## Acceptance Criteria

各条件はテストで検証可能であること。

- [x] **AC-1 (Behavior)**: `knowledgine search "query" --projects /abs/path/to/repo`
      が `.knowledginerc` 登録なしで動作する。
      検証: `tests/commands/search-cross-project.test.ts` 9 ケース PASS +
      手動 E2E (絶対 / 相対 / `~/` / Case A/B/D / 混在) すべて期待動作
- [x] **AC-2 (Documentation)**: README に `#### Cross-Project Search` セクション
      (registered + path + 制約)、`docs/README.ja.md` も対称、
      `pnpm prettier --check` PASS
- [x] **AC-3 (Test Coverage)**: `pnpm --filter @knowledgine/cli test:coverage`
      で `src/lib/resolve-project-args.ts` が
      statement 94.36% / branch 88% / function 100%（80% 閾値クリア）
- [x] **AC-4 (CI Green)**: Node 20 / 22 両方で
      `build → typecheck → lint → format:check → test:run → audit` 全て exit 0
      （`.tmp/know-403-evidence/n{20,22}-*.log` に保存）。CI matrix 緑は push 後に確認

## Constraints

- **Performance**: 引数解決は同期 / O(n)。FS アクセスは `existsSync` のみ
- **Compatibility**: 既存 `--projects <registered-name>` 指定は 100% 後方互換
  （回帰テスト 1, 18 でガード）。エラー文言は拡張のみ、既存キー
  `"No matching"` は保持
- **Security**: 任意 path 受領のため、CLI 層は path 検証せず、core 層の
  `existsSync` + readonly DB open に委譲（既存実装）。SQL parameterization は
  core の `searchNotesWithRank` が担保
- **Platform**: Windows サポートは best-effort（CI は Linux/macOS のみ）。
  separator は判定ロジックでカバーするが、絶対 path 判定の本格テストは
  POSIX 系のみ実施

## Affected Packages

- [ ] `@knowledgine/core`
- [x] `@knowledgine/cli`
- [ ] `@knowledgine/mcp-server`
- [ ] `@knowledgine/ingest`
- [ ] `@knowledgine/mcp-memory-protocol`

## Out of Scope

- basename 衝突解決（`/work/repo` と `/home/x/repo` の disambiguation） —
  後続チケット
- glob 展開（`--projects "/repos/*"`）
- リモート URL（`--projects https://github.com/...`）
- `.knowledginerc` 自動更新
- Symbolic link 解決（`fs.realpath`）— `path.resolve` のみ
- `~user/...`（other-user tilde expansion）
- MCP server / REST server の `search_knowledge` 動的パス対応 — 後続チケット
  （UX 整合のため `.describe()` に "(registered names only)" の 1 行注記のみ追加）
- エラー文言の i18n（CLI に i18n インフラなし。skill template ja のみ翻訳）

## Prior Art / References

- 元タスク: `~/workspaces/dev-butler/projects/knowledgine/tasks/クロスプロジェクト検索改善.md`
- 既存 core: `packages/core/src/search/cross-project-searcher.ts:25-85`
- 既存 CLI: `packages/cli/src/commands/search.ts:67-116`
- 既存 fixture pattern: `packages/core/tests/search/cross-project-searcher.test.ts:9-22`
