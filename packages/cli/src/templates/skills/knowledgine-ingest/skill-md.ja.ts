export const SKILL_MD = `---
name: knowledgine-ingest
version: "1.0.0"
lang: ja
description: >
  外部ソースからローカルナレッジベースへ知識をインポートする。Git コミット履歴、
  GitHub の PR・Issue、Obsidian Vault、Claude または Cursor のセッション履歴、
  CI/CD パイプラインからのインポートを行う際に呼び出す。
  各ソースには専用プラグインと設定が必要。
---
# knowledgine-ingest

## 目的

バージョン管理履歴、Issue トラッカー、個人ノートシステム、AI セッションログなど、
外部ナレッジリポジトリからナレッジベースへ手動キャプチャなしにデータを投入する。
インジェストにより、現セッション以前の歴史的コンテキストでナレッジベースが強化される。

## 使用するタイミング

- **コードベースへのオンボーディング** — Git 履歴をインジェストして過去の意思決定を把握する
- **GitHub 知識の統合** — PR と Issue をコンテキストとしてインポートする
- **Obsidian ノートのインポート** — 個人またはチームのノートをナレッジベースに取り込む
- **AI セッション履歴のキャプチャ** — Claude または Cursor のセッションログをインポートする
- **CI 知識の構築** — CI/CD パイプラインの結果とパターンをインポートする
- **ユーザーが明示的にインポートを要求した場合** — 「Obsidian からノートを読み込んで」

## 使用しないタイミング

- 当セッション内でそのソースがすでに完全にインジェスト済みの場合（カーソル状態を確認）
- 必要な認証情報（例: GITHUB_TOKEN）をユーザーが設定していない場合

## インジェスト方法（CLI）

\`\`\`bash
# 特定のプラグインを実行
knowledgine ingest --source <plugin-id> --path <knowledge-base-path>

# 登録済みプラグインをすべて実行
knowledgine ingest --all --path <knowledge-base-path>

# 完全な再インジェストを強制（保存済みカーソルを無視）
knowledgine ingest --source <plugin-id> --full --path <knowledge-base-path>

# GitHub 専用（GITHUB_TOKEN 環境変数が必要）
knowledgine ingest --source github --repo owner/repo --path <path>
\`\`\`

## 利用可能なソースプラグイン

| Plugin ID | ソース | 備考 |
|-----------|--------|-------|
| \`markdown\` | ローカルの Markdown ファイル | デフォルト；\`knowledgine init\` で使用 |
| \`git-history\` | Git コミットメッセージと差分 | コミット履歴から意思決定を抽出 |
| \`github\` | GitHub の PR と Issue | \`GITHUB_TOKEN\` 環境変数が必要 |
| \`obsidian\` | Obsidian Vault のノート | 設定済み Vault パスから読み込む |
| \`claude-sessions\` | Claude Code セッションログ | 過去の AI セッションコンテキストをインポート |
| \`cursor-sessions\` | Cursor IDE セッション履歴 | Cursor セッションコンテキストをインポート |
| \`cicd\` | CI/CD パイプラインの結果 | GitHub Actions、ビルド結果 |

## 手順

1. **ソースを特定する** — どの外部システムにインポートすべき知識があるか？
2. **前提条件を確認する** — プラグインに認証情報や設定が必要か？（plugin-guide.md を参照）
3. **インジェストコマンドを実行する** — 適切なプラグイン ID とオプションを使用する
4. **結果を確認する** — \`knowledgine status\` を実行するか、検索してノートがインポートされたことを確認する
5. **必要に応じて再インジェストする** — \`--full\` フラグで処理済みコンテンツを再処理する

## ベストプラクティス

- 新しいリポジトリで作業を開始する際は \`git-history\` インジェストを実行する
- レート制限を避けるため、GitHub コンテンツのインジェスト前に \`GITHUB_TOKEN\` を設定する
- インジェスト設定を変更した後は \`--full\` フラグを使用する
- \`knowledgine plugins status\` で各プラグインの最終インジェストカーソルを確認する

## 参照ファイル

- 各プラグインの詳細ドキュメントは \`plugin-guide.md\` を参照
- 各ソースタイプの設定要件は \`source-types.md\` を参照
`;
