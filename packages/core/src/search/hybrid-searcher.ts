import type { KnowledgeRepository, KnowledgeNoteSummary } from "../storage/knowledge-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import type { SemanticSearchResult } from "./semantic-searcher.js";

export class HybridSearcher {
  /**
   * @param alpha - FTSスコアの重み (0-1)。デフォルト 0.3。残り (1-α) がベクトルスコアの重み。
   */
  constructor(
    private repository: KnowledgeRepository,
    private embeddingProvider: EmbeddingProvider,
    private alpha: number = 0.3,
  ) {}

  async search(query: string, limit: number = 20): Promise<SemanticSearchResult[]> {
    // 両方のスコアを並行取得
    const [ftsRows, vecResults] = await Promise.all([
      Promise.resolve(this.repository.searchNotesWithRank(query, limit * 2)),
      this.embeddingProvider
        .embed(query)
        .then((emb) => this.repository.searchByVector(emb, limit * 2)),
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

    // ベクトルスコアマップ (distance → 0-1 score)
    const vecMap = new Map<number, number>();
    for (const { note_id, distance } of vecResults) {
      vecMap.set(note_id, 1 / (1 + distance));
    }

    // 全ノートIDを統合
    const allIds = new Set([...ftsMap.keys(), ...vecMap.keys()]);

    const scored: Array<{ noteId: number; score: number }> = [];
    for (const noteId of allIds) {
      const ftsScore = ftsMap.get(noteId) ?? 0;
      const vecScore = vecMap.get(noteId) ?? 0;
      const finalScore = this.alpha * ftsScore + (1 - this.alpha) * vecScore;
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
