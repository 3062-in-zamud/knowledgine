# KNOW-409 Tasks

## Ordered Tasks
- [x] gh-parser に repo-not-found 判定 helper を追加する。
- [x] GitHub plugin preflight で not-found を friendly error に変換する。
- [x] CLI ingest catch で最終メッセージ整形を追加する。
- [x] plugin / parser / CLI テストを追加・更新する。
- [x] Node 22 で関連テストを確認する。

## Verification
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH pnpm exec vitest run packages/ingest/tests/plugins/github/gh-parser.test.ts packages/ingest/tests/plugins/github/github-preflight.test.ts packages/cli/tests/commands/ingest-github-errors.test.ts`
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH pnpm build`
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH pnpm exec vitest run packages/ingest/tests/plugins/github/gh-parser.test.ts packages/ingest/tests/plugins/github/github-preflight.test.ts packages/cli/tests/commands/ingest-github-errors.test.ts`
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH pnpm exec vitest run packages/core/tests/**/*.test.ts packages/ingest/tests/**/*.test.ts packages/mcp-server/tests/**/*.test.ts packages/cli/tests/**/*.test.ts packages/mcp-memory-protocol/tests/**/*.test.ts`

## Notes
- package 明示の広めテストは `packages/cli/tests/e2e/serve-smoke.test.ts` のみ失敗。原因は sandbox の `listen EPERM 127.0.0.1:*` で、変更差分とは無関係。
