# KNOW-408 Tasks

## Ordered Tasks
- [x] 既存回帰を再現するテストを追加する。
- [x] repository に vector index stats / backfill API を追加する。
- [x] semantic / hybrid search で backfill を自動実行する。
- [x] readiness / status / doctor / embed-missing を vector index 基準に修正する。
- [x] Node 22 で関連テストと再現手順を確認する。

## Verification
- `volta run --node 22 pnpm exec vitest run packages/core/tests/search/semantic-searcher.test.ts packages/core/tests/utils/semantic-readiness.test.ts packages/cli/tests/status-readiness.test.ts packages/cli/tests/commands/ingest-embedding.test.ts`
- `volta run --node 22 pnpm test:run`
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH pnpm build`
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH pnpm exec vitest run packages/core/tests/search/semantic-searcher.test.ts packages/core/tests/storage/migration-003.test.ts packages/core/tests/utils/semantic-readiness.test.ts packages/cli/tests/status-readiness.test.ts packages/cli/tests/commands/ingest-embedding.test.ts packages/cli/tests/commands/search-fallback.test.ts packages/cli/tests/commands/search-semantic-repair.test.ts`
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH /Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin/node packages/cli/dist/index.js search "FastAPI" --mode semantic --path /tmp/test-fastapi-know-408`
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH /Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin/node packages/cli/dist/index.js search "FastAPI" --mode keyword --path /tmp/test-fastapi-know-408`
- `PATH=/Users/ren0826nosuke/.volta/tools/image/node/22.17.1/bin:$PATH pnpm exec vitest run packages/core/tests/**/*.test.ts packages/ingest/tests/**/*.test.ts packages/mcp-server/tests/**/*.test.ts packages/cli/tests/**/*.test.ts packages/mcp-memory-protocol/tests/**/*.test.ts`

## Notes
- package 明示の広めテストは `packages/cli/tests/e2e/serve-smoke.test.ts` のみ失敗。原因は sandbox の `listen EPERM 127.0.0.1:*` で、変更差分とは無関係。
