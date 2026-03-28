export const REFERENCES: Record<string, string> = {
  "plugin-guide.md": `# プラグインガイド

knowledgine インジェストプラグインの詳細ドキュメント。

---

## markdown

**Plugin ID**: \`markdown\`
**ソース**: ナレッジベースディレクトリ内のローカル Markdown ファイル

\`knowledgine init\` で使用されるデフォルトプラグイン。設定済みのルートディレクトリを
スキャンして \`.md\` ファイルをインデックスする。

\`\`\`bash
knowledgine ingest --source markdown --path ~/notes
\`\`\`

**キャプチャ内容**: Markdown ファイルの全文、フロントマターのメタデータ、見出し、
コードブロック。

**増分対応**: あり。ファイルの更新日時を追跡し、変更されたファイルのみ再インジェストする。

---

## git-history

**Plugin ID**: \`git-history\`
**ソース**: Git リポジトリのコミット履歴

Git コミットメッセージと関連する差分から知識を抽出する。特定のファイルの
過去の設計上の意思決定や変遷を理解するのに有用。

\`\`\`bash
knowledgine ingest --source git-history --path ~/project
\`\`\`

**キャプチャ内容**: コミットメッセージ（特に \`feat:\`、\`fix:\`、\`refactor:\` などの
Conventional Commits プレフィックス）、変更されたファイルパス、コミットのメタデータ。

**前提条件**: Git リポジトリ内で実行するか、\`--path\` でリポジトリを指定する必要がある。

**増分対応**: あり。最後に処理したコミットハッシュを追跡する。

**ヒント**:
- 初回セットアップ時に \`--full\` を付けて実行し、完全な履歴を取得する
- Conventional Commits 形式のコミットメッセージを使用すると、より高品質なキャプチャが得られる

---

## github

**Plugin ID**: \`github\`
**ソース**: GitHub Pull Request と Issue

GitHub リポジトリから PR の説明、Issue の本文、コメントを取得する。
設計上の議論、バグ報告、意思決定の根拠をキャプチャする。

\`\`\`bash
GITHUB_TOKEN=<token> knowledgine ingest --source github --repo owner/repo --path ~/project
\`\`\`

**前提条件**:
- \`repo\` スコープ（公開リポジトリは \`public_repo\`）を持つ \`GITHUB_TOKEN\` 環境変数
- リポジトリを指定する \`--repo\` フラグ（形式: \`owner/repo\`）

**キャプチャ内容**: PR のタイトルと本文、Issue のタイトルと本文、ラベル。

**レート制限**: 認証済みリクエストを使用；トークンあり 5000 リクエスト/時間。

**増分対応**: あり。最後に取得したアイテム番号を追跡する。

---

## obsidian

**Plugin ID**: \`obsidian\`
**ソース**: Obsidian Vault の Markdown ノート

Obsidian Vault からノートをインポートし、内部リンクとタグを保持する。

\`\`\`bash
knowledgine ingest --source obsidian --path ~/vault
\`\`\`

**キャプチャ内容**: ノートの内容、Obsidian タグ（knowledgine タグに変換）、
WikiLink、フロントマター。

**前提条件**: Obsidian Vault ディレクトリにアクセスできること。特別な設定は不要—
Obsidian はノートをプレーンな Markdown として保存する。

**ヒント**:
- Vault を再編成した後は \`--full\` を使用する
- \`#private\` または \`#ignore\` タグが付いたノートはプラグイン設定で除外できる

---

## claude-sessions

**Plugin ID**: \`claude-sessions\`
**ソース**: Claude Code セッション履歴

セッション履歴に保存された過去の Claude Code セッションのコンテキストをインポートする。

\`\`\`bash
knowledgine ingest --source claude-sessions --path ~/project
\`\`\`

**キャプチャ内容**: セッションのサマリー、過去の Claude Code セッション中に記録された
主要な意思決定と発見。

**保存場所**: Claude Code はセッション履歴を
\`~/.claude/projects/<project-hash>/\` に保存する。

---

## cursor-sessions

**Plugin ID**: \`cursor-sessions\`
**ソース**: Cursor IDE セッション履歴

Cursor IDE の AI 会話履歴から知識をインポートする。

\`\`\`bash
knowledgine ingest --source cursor-sessions --path ~/project
\`\`\`

**キャプチャ内容**: コードの意思決定、バグ修正、アーキテクチャの議論を含む
Cursor AI の会話内容。

**保存場所**: Cursor はセッションデータを SQLite ワークスペースデータベースに保存する。

---

## cicd

**Plugin ID**: \`cicd\`
**ソース**: CI/CD パイプラインの結果（GitHub Actions）

CI/CD パイプラインの結果、失敗したテスト結果、デプロイ記録をインポートする。

\`\`\`bash
GITHUB_TOKEN=<token> knowledgine ingest --source cicd --repo owner/repo --path ~/project
\`\`\`

**キャプチャ内容**: ワークフロー実行のサマリー、失敗したジョブの詳細、デプロイイベント。

**前提条件**: \`GITHUB_TOKEN\` と \`--repo\` フラグ（github プラグインと同様）。

**ユースケース**: CI 履歴から不安定なテスト、インフラの問題、デプロイパターンに
関する知識を構築する。
`,

  "source-types.md": `# ソースタイプと設定

各インジェストソースの設定要件と環境変数。

---

## 設定サマリー

| ソース | 必須設定 | オプション設定 |
|--------|----------------|-----------------|
| \`markdown\` | \`--path\`（ナレッジベースディレクトリ） | — |
| \`git-history\` | \`--path\`（Git リポジトリディレクトリ） | \`--full\` でカーソルをリセット |
| \`github\` | \`GITHUB_TOKEN\`、\`--repo\` | \`--full\` |
| \`obsidian\` | \`--path\`（Vault ディレクトリ） | \`--full\` |
| \`claude-sessions\` | \`--path\` | — |
| \`cursor-sessions\` | \`--path\` | — |
| \`cicd\` | \`GITHUB_TOKEN\`、\`--repo\` | \`--full\` |

---

## 環境変数

### GITHUB_TOKEN

\`github\` と \`cicd\` プラグインで必要。

\`\`\`bash
# シェルで設定
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# またはコマンドに前置する
GITHUB_TOKEN=ghp_xxx knowledgine ingest --source github --repo owner/repo
\`\`\`

**必要なスコープ**:
- 公開リポジトリ: \`public_repo\`
- プライベートリポジトリ: \`repo\`
- CI/CD 用: \`workflow\` スコープを追加

**トークンの作成**:
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)

---

## カーソル状態の管理

各プラグインは増分インジェストを可能にするため「カーソル」（最後に処理した位置）を追跡する。
カーソル状態を確認してリセットできる:

\`\`\`bash
# すべてのプラグインのカーソル状態を確認
knowledgine plugins status --path ~/project

# カーソルをリセットして完全な再インジェストを強制
knowledgine ingest --source <plugin> --full --path ~/project
\`\`\`

---

## 複数プラグインの実行

\`\`\`bash
# 登録済みプラグインをすべて順番に実行
knowledgine ingest --all --path ~/project

# 登録済みプラグインを確認
knowledgine plugins list
\`\`\`

---

## トラブルシューティング

### "No plugin registered with ID: xxx"
プラグインが登録されていない。\`knowledgine plugins list\` でプラグイン ID のスペルを確認する。

### "GITHUB_TOKEN not set"
github または cicd プラグインを実行する前に \`GITHUB_TOKEN\` 環境変数を設定する。

### "Repository not found"
\`--repo\` フラグが \`owner/repo\` 形式になっているか、トークンがリポジトリへのアクセス権を
持っているか確認する。

### インジェストで 0 件のノートが生成された
- \`--path\` が正しいディレクトリを指しているか確認する
- git-history の場合: パスに .git ディレクトリが含まれているか確認する
- obsidian の場合: パスに .md ファイルが含まれているか確認する
- \`--full\` を試してカーソルをリセットし、すべてのコンテンツを再処理する
`,
};
