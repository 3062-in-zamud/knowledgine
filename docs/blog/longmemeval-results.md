# $0のローカルメモリが、Mem0とZepを抜いた話

73.2%。

LongMemEvalのTask-Averaged Accuracyで、Mem0（49%）とZep（71%）を超えた。クラウドSaaS不要、APIキー不要、月額$0。全部ローカルで完結するメモリシステムKnowledgineの話。

---

## Knowledgineって何

AIエージェント向けのメモリレイヤー。MCP（Model Context Protocol）サーバーとして動いて、Claude CodeやCursorに「記憶」を持たせる。

FTS5（SQLiteの全文検索）+ sqlite-vec（ベクトル検索）+ Knowledge Graphの3層構造で動いてる。データは全部ローカルのSQLiteファイル。会話内容がどこかのサーバーに飛ぶことはない。

```bash
npx knowledgine
# これだけで動く
```

（ちなみにDockerも要らない）

---

## LongMemEvalでどう測ったか

[LongMemEval](https://github.com/xiaowu0162/LongMemEval)は、メモリシステムのベンチマーク。500問の質問セットで、「過去の会話から正確に情報を引き出せるか」を測る。

カテゴリは6種類あって、シンプルな一問一答から「複数セッションにまたがった情報の統合」まで難易度がバラバラ。ジャッジはルールベース（文字列正規化＋部分一致）を使った。競合他社がLLMジャッジを使ってる点は注意が必要で、ルールベースは厳しめに出る傾向がある。

再現は `pnpm run benchmark:longmemeval` の一発で動く。

---

## 結果

| カテゴリ                  | 精度      |
| ------------------------- | --------- |
| single-session-assistant  | **96.4%** |
| single-session-user       | 82.9%     |
| multi-session             | 78.9%     |
| knowledge-update          | 71.8%     |
| temporal-reasoning        | 62.4%     |
| single-session-preference | 46.7%     |

single-session-assistantが96.4%。「アシスタントが過去に言ったこと」を引き出す精度はほぼ完璧に近い。FTS5の全文検索がはっきり効いてる領域。

一方でpreferenceは46.7%止まり。「好みの〇〇は何ですか」系の質問は弱い。「好き」「嫌い」「お気に入り」みたいなふわっとした記述を正確に拾うのは、キーワード検索の限界がある。ここは正直まだ課題。

---

## 50.5% → 73.2%に何をやったか

最初のスコアは50.5%だった。Mem0よりちょっと高い程度で、Zepに20ポイント差をつけられてた。

改善のポイントは3つ。

**日付パースの修正。** ベンチマークのhaystack日付フォーマットが `"2023/05/20 (Sat) 02:21"` という独特な形式で、ISO 8601しか受け付けてなかったフィルタが全部スルーしてた。temporal-reasoning系の質問がほぼ全滅してた原因がここ。42.1% → 62.4%に改善。

**FTS5クエリの強化。** キーワードの重み付けとクエリ展開を調整した。

**multi-session統合。** 複数セッションにまたがる質問への対応を追加。46.6% → 78.9%へ。

---

## 競合との比較

| システム         | Task-Averaged | 備考                 |
| ---------------- | ------------- | -------------------- |
| Mem0             | 49%           | LLMジャッジ          |
| Zep              | 71%           | LLMジャッジ          |
| **Knowledgine**  | **73.2%**     | ルールベースジャッジ |
| Supermemory Prod | ~82-86%       | LLMジャッジ          |

ジャッジ方式が違うので純粋比較はできないけど、ルールベースは厳しく出るので、LLMジャッジなら73.2%以上になる可能性が高い。

コストの話をすると、Mem0もZepもSaaSなので月額費用がかかる。Knowledgineはローカル動作で$0。プライバシーの面でも、会話データが自分のマシン外に出ない。この差はでかい。

---

## 次にやること

preferenceの46.7%が悔しい。ここを60%台に持っていきたい。あとLLMジャッジでの計測も試したい（スコアが跳ね上がる予感がしてる）。

---

## 試してみたい人へ

```bash
# インストール
npm install -g knowledgine

# MCP設定（claude_desktop_config.jsonに追加）
{
  "mcpServers": {
    "knowledgine": {
      "command": "knowledgine"
    }
  }
}
```

Claude Codeなら `claude mcp add knowledgine -- npx knowledgine` の一行で終わる。

ローカルで動くAIメモリ、思ったより実用的だと思う。

---

## X(Twitter)投稿用サマリー

$0のローカルメモリがMem0(49%)とZep(71%)を超えた。KnowledgineのLongMemEval Task-Averaged Accuracy 73.2%。FTS5+sqlite-vec+KGの3層構造、データはローカルSQLiteのみ。 npx knowledgineで動く。
