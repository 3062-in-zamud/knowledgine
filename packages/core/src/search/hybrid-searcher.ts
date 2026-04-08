import type { KnowledgeRepository, KnowledgeNoteSummary } from "../storage/knowledge-repository.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import type { SemanticSearchResult } from "./semantic-searcher.js";
import { applyScoreDiscounts } from "./score-adjustments.js";

export class HybridSearcher {
  /**
   * @param alpha - CJK gate threshold (0-1). Default 0.3. When a CJK-dominant
   *   query is detected with a bert model, effectiveAlpha is raised to 1.0
   *   (FTS-only). For alpha < 1.0, scores are fused via Reciprocal Rank Fusion
   *   (RRF) without per-source weighting. The alpha value itself does not scale
   *   FTS vs vector contributions in RRF mode.
   * @param modelFamily - Embedding model family. Used with alpha to determine
   *   whether CJK queries should fall back to FTS-only mode.
   * @param semanticThreshold - Minimum cosine similarity for vector results.
   *   Entries below this threshold are excluded from the vector result set.
   *   Default 0.5.
   */
  constructor(
    private repository: KnowledgeRepository,
    private embeddingProvider: EmbeddingProvider,
    private alpha: number = 0.3,
    private modelFamily: "bert" | "e5" = "bert",
    private semanticThreshold: number = 0.5,
  ) {}

  /**
   * Determine semantic similarity threshold based on query length.
   * Short keyword queries use strict threshold to filter noise;
   * longer natural-language queries use relaxed threshold to find partial matches.
   * For CJK queries (no spaces), falls back to character count as proxy for token count.
   */
  private getSemanticThreshold(query: string): number {
    const trimmed = query.trim();
    const wordCount = trimmed.split(/\s+/).length;

    // CJK fallback: languages without spaces appear as 1 "word" regardless of length.
    // Use character count as proxy: ~2 chars per CJK token on average.
    let effectiveTokenCount = wordCount;
    if (wordCount === 1 && trimmed.length > 2) {
      const cjkChars = trimmed.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g);
      if (cjkChars && cjkChars.length >= 2) {
        effectiveTokenCount = Math.ceil(cjkChars.length / 2);
      }
    }

    if (effectiveTokenCount <= 2) return this.semanticThreshold; // short: strict
    if (effectiveTokenCount <= 5) return Math.min(this.semanticThreshold, 0.4);
    return Math.min(this.semanticThreshold, 0.3); // long queries: relaxed
  }

  /**
   * クエリに応じてalphaを動的に決定する。
   * CJK文字が支配的な場合、モデルの多言語能力に応じてalphaを調整する。
   *
   * - CJK割合 < 30%: 通常のalpha（主にラテン文字クエリ）
   * - CJK支配的 + e5モデル: alpha=0.3（多言語モデルはsemantic寄りblendedが有効）
   * - CJK支配的 + bertモデル: alpha=1.0（英語専用モデルはキーワードのみ）
   */
  private determineAlpha(query: string): number {
    const cjkChars = query.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g);
    if (!cjkChars) return this.alpha; // CJKなし → 通常のalpha

    const cjkRatio = cjkChars.length / query.length;
    if (cjkRatio < 0.3) return this.alpha; // 主にラテン文字 → 通常

    // CJK支配的なクエリ
    if (this.modelFamily === "e5") return 0.3; // 多言語モデル → semantic寄りblended
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

    // ベクトルスコアマップ (L2 distance → cosine similarity)。動的threshold未満は除外。
    // SemanticSearcher と同じ変換式: cosine_similarity = 1 - L2_distance² / 2 (unit vectors)
    const effectiveThreshold = this.getSemanticThreshold(query);
    const vecMap = new Map<number, number>();
    for (const { note_id, distance } of vecResults) {
      const score = Math.max(0, 1 - (distance * distance) / 2);
      if (score >= effectiveThreshold) {
        vecMap.set(note_id, score);
      }
    }

    // --- Score fusion ---
    let scored: Array<{ noteId: number; score: number }>;

    if (effectiveAlpha >= 1.0) {
      // alpha=1.0 (CJK+bert): FTS-only — 現行min-max正規化を維持（RRF不使用）
      scored = [...ftsMap.entries()].map(([noteId, score]) => ({ noteId, score }));
    } else {
      // RRF (Reciprocal Rank Fusion) — alpha < 1.0
      // FTS結果にランク付与 (score降順 = 最良が rank 1)
      const ftsRanked = [...ftsMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([noteId], i) => ({ noteId, rank: i + 1 }));

      // Vector結果にランク付与 (semanticThreshold通過済みのみ、distance昇順 = 最良が rank 1)
      const vecRanked = vecResults
        .filter((r) => vecMap.has(r.note_id))
        .map((r, i) => ({ noteId: r.note_id, rank: i + 1 }));

      const k = 60;
      const rrfScores = new Map<number, number>();
      for (const { noteId, rank } of ftsRanked) {
        rrfScores.set(noteId, (rrfScores.get(noteId) ?? 0) + 1 / (k + rank));
      }
      for (const { noteId, rank } of vecRanked) {
        rrfScores.set(noteId, (rrfScores.get(noteId) ?? 0) + 1 / (k + rank));
      }

      // Fixed scaling (replaces min-max normalization to preserve absolute score differences)
      // RRF theoretical max: 2/(k+1) when a doc is rank=1 in both sources
      // scaleFactor maps this max to 1.0; single-source-only docs max at ~0.5 (for 2+ results)
      // Special case: single result gets 1.0 for backward compat (see size===1 branch)
      if (rrfScores.size === 0) {
        scored = [];
      } else if (rrfScores.size === 1) {
        // Single result: maintain backward compat score of 1.0 (overrides ~0.5 scaling)
        const [noteId] = rrfScores.keys();
        scored = [{ noteId, score: 1.0 }];
      } else {
        const scaleFactor = (k + 1) / 2;
        scored = [];
        for (const [noteId, rrf] of rrfScores) {
          scored.push({ noteId, score: Math.min(1.0, rrf * scaleFactor) });
        }
      }
    }

    // discount適用前の候補プールを広めに取得（discount後のre-rankで正しい上位を選出するため）
    scored.sort((a, b) => b.score - a.score);
    const candidatePool = scored.slice(0, limit * 3);

    // N+1解消: IDリストを先に集めてバッチ取得
    const candidateIds = candidatePool.map(({ noteId }) => noteId);
    const notes = this.repository.getNotesSummaryByIds(candidateIds);
    const noteMap = new Map<number, KnowledgeNoteSummary>(notes.map((n) => [n.id, n]));

    const results: SemanticSearchResult[] = [];
    for (const { noteId, score } of candidatePool) {
      const note = noteMap.get(noteId);
      if (!note) continue;

      const adjustedScore = applyScoreDiscounts(score, {
        filePath: note.file_path,
        confidence: note.confidence,
      });

      const hasFts = ftsMap.has(noteId);
      const hasVec = vecMap.has(noteId);
      const reasons: string[] = [];
      if (hasFts) reasons.push(`キーワード: ${(ftsMap.get(noteId)! * 100).toFixed(1)}%`);
      if (hasVec) reasons.push(`セマンティック: ${(vecMap.get(noteId)! * 100).toFixed(1)}%`);
      results.push({ note, score: adjustedScore, matchReason: reasons });
    }

    // discount反映後にソートし、最終的なlimit件を返す
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
