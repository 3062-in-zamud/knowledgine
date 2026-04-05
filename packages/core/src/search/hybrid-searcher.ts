import type { KnowledgeRepository, KnowledgeNoteSummary } from "../storage/knowledge-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import type { SemanticSearchResult } from "./semantic-searcher.js";

export class HybridSearcher {
  /**
   * @param alpha - FTSスコアの重み (0-1)。デフォルト 0.3。残り (1-α) がベクトルスコアの重み。
   * @param modelFamily - 使用するモデルファミリー。CJKクエリの動的alpha判定に使用。
   * @param semanticThreshold - semantic スコアの最低閾値。これ未満のエントリは vecMap から除外。デフォルト 0.5。
   */
  constructor(
    private repository: KnowledgeRepository,
    private embeddingProvider: EmbeddingProvider,
    private alpha: number = 0.3,
    private modelFamily: "bert" | "e5" = "bert",
    private semanticThreshold: number = 0.5,
  ) {}

  /**
   * クエリに応じてalphaを動的に決定する。
   * CJK文字が支配的な場合、モデルの多言語能力に応じてalphaを調整する。
   *
   * - CJK割合 < 30%: 通常のalpha（主にラテン文字クエリ）
   * - CJK支配的 + e5モデル: alpha=0.5（多言語モデルはblendedが有効）
   * - CJK支配的 + bertモデル: alpha=1.0（英語専用モデルはキーワードのみ）
   */
  private determineAlpha(query: string): number {
    const cjkChars = query.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g);
    if (!cjkChars) return this.alpha; // CJKなし → 通常のalpha

    const cjkRatio = cjkChars.length / query.length;
    if (cjkRatio < 0.3) return this.alpha; // 主にラテン文字 → 通常

    // CJK支配的なクエリ
    if (this.modelFamily === "e5") return 0.5; // 多言語モデル → blended
    return 1.0; // 英語専用モデル → キーワードのみ
  }

  async search(query: string, limit: number = 20): Promise<SemanticSearchResult[]> {
    const effectiveAlpha = this.determineAlpha(query);
    if (effectiveAlpha < 1.0) {
      try {
        this.repository.syncMissingVectorsFromEmbeddings();
      } catch {
        // ベクトル同期失敗時もFTSのみで継続してgraceful degradationする
      }
    }

    // 両方のスコアを並行取得。alpha=1.0のときはベクトル検索をスキップ。
    const [ftsRows, vecResults] = await Promise.all([
      Promise.resolve(this.repository.searchNotesWithRank(query, limit * 2)),
      effectiveAlpha < 1.0
        ? this.embeddingProvider
            .embedQuery(query)
            .then((emb) => this.repository.searchByVector(emb, limit * 2))
            .catch(() => []) // 埋め込み失敗時はgraceful fallback
        : Promise.resolve([]),
    ]);

    // FTSスコアのMin-Max正規化（rankは負値なので絶対値を使う）
    const ftsMap = new Map<number, number>();
    if (ftsRows.length > 0) {
      const rawRanks = ftsRows.map((r) => Math.abs(r.rank));
      const minRank = Math.min(...rawRanks);
      const maxRank = Math.max(...rawRanks);
      const range = maxRank - minRank;

      for (const { note, rank } of ftsRows) {
        const normalized = range > 0 ? (Math.abs(rank) - minRank) / range : 1.0;
        // FTS5 rank は「スコア」ではなく「距離」に近いので反転
        ftsMap.set(note.id, 1 - normalized);
      }
    }

    // ベクトルスコアマップ (L2 distance → cosine similarity)。semanticThreshold 未満は除外。
    // SemanticSearcher と同じ変換式: cosine_similarity = 1 - L2_distance² / 2 (unit vectors)
    const vecMap = new Map<number, number>();
    for (const { note_id, distance } of vecResults) {
      const score = Math.max(0, 1 - (distance * distance) / 2);
      if (score >= this.semanticThreshold) {
        vecMap.set(note_id, score);
      }
    }

    // Detect flattened semantic scores → shift alpha toward keyword
    const vecScores = [...vecMap.values()].sort((a, b) => b - a);
    const semanticSpread =
      vecScores.length >= 2 ? vecScores[0] - vecScores[Math.min(4, vecScores.length - 1)] : 1.0; // Single or no result → assume good spread

    let finalAlpha = effectiveAlpha;
    if (effectiveAlpha < 1.0) {
      // Only adjust when semantic search is active
      const adaptiveAlpha = semanticSpread < 0.05 ? 0.7 : 0.5;
      finalAlpha = Math.max(effectiveAlpha, adaptiveAlpha);
    }

    // 全ノートIDを統合
    const allIds = new Set([...ftsMap.keys(), ...vecMap.keys()]);

    const scored: Array<{ noteId: number; score: number }> = [];
    for (const noteId of allIds) {
      const ftsScore = ftsMap.get(noteId) ?? 0;
      const vecScore = vecMap.get(noteId) ?? 0;
      const finalScore = finalAlpha * ftsScore + (1 - finalAlpha) * vecScore;
      scored.push({ noteId, score: finalScore });
    }

    scored.sort((a, b) => b.score - a.score);
    const topN = scored.slice(0, limit);

    // N+1解消: IDリストを先に集めてバッチ取得
    const topNIds = topN.map(({ noteId }) => noteId);
    const notes = this.repository.getNotesSummaryByIds(topNIds);
    const noteMap = new Map<number, KnowledgeNoteSummary>(notes.map((n) => [n.id, n]));

    const results: SemanticSearchResult[] = [];
    for (const { noteId, score } of topN) {
      const note = noteMap.get(noteId);
      if (!note) continue;
      const hasFts = ftsMap.has(noteId);
      const hasVec = vecMap.has(noteId);
      const reasons: string[] = [];
      if (hasFts) reasons.push(`キーワード: ${(ftsMap.get(noteId)! * 100).toFixed(1)}%`);
      if (hasVec) reasons.push(`セマンティック: ${(vecMap.get(noteId)! * 100).toFixed(1)}%`);
      results.push({ note, score, matchReason: reasons });
    }

    return results;
  }
}
