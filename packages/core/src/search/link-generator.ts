import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";
import type { GraphRepository } from "../graph/graph-repository.js";

export interface RelatedNote {
  id: number;
  filePath: string;
  title: string;
  similarity: number;
  reason: string;
}

export class LocalLinkGenerator {
  constructor(
    private repository: KnowledgeRepository,
    private graphRepository?: GraphRepository,
  ) {}

  findRelatedNotes(noteId: number, limit = 5): RelatedNote[] {
    const currentNote = this.repository.getNoteById(noteId);
    if (!currentNote) return [];

    const relatedNotes: RelatedNote[] = [];

    relatedNotes.push(...this.findByTagSimilarity(currentNote, limit * 2));
    relatedNotes.push(...this.findByTitleSimilarity(currentNote, limit * 2));
    relatedNotes.push(...this.findByTimeProximity(currentNote, limit));
    relatedNotes.push(...this.findByProblemSolutionPairs(noteId));
    if (this.graphRepository) {
      relatedNotes.push(...this.findByGraphTraversal(noteId, limit));
    }

    const uniqueNotes = this.deduplicateAndRank(relatedNotes, noteId);
    return uniqueNotes.slice(0, limit);
  }

  /**
   * グラフトラバーサルで同じエンティティを共有するノートを取得する。
   * IDF重み付け（対数減衰）により稀なエンティティほど高スコアを付与する。
   */
  private findByGraphTraversal(noteId: number, limit: number): RelatedNote[] {
    if (!this.graphRepository) return [];
    const linkedEntities = this.graphRepository.getLinkedEntities(noteId);
    const relatedNotes: RelatedNote[] = [];
    const seen = new Set<number>([noteId]);

    for (const entity of linkedEntities) {
      // IDF-based scoring: 稀なエンティティ（df小）ほど高スコア
      const df = this.graphRepository.getEntityNoteCount(entity.id!);
      const similarity = 1 / (1 + Math.log(1 + df)); // df=0→1.0, df=1→0.59, df=10→0.29, df=100→0.18

      const entityNotes = this.graphRepository.getLinkedNotes(entity.id!);
      for (const { noteId: linkedNoteId } of entityNotes) {
        if (seen.has(linkedNoteId)) continue;
        seen.add(linkedNoteId);
        const note = this.repository.getNoteById(linkedNoteId);
        if (note) {
          relatedNotes.push({
            id: note.id,
            filePath: note.file_path,
            title: note.title,
            similarity,
            reason: `共通エンティティ: ${entity.name}`,
          });
        }
        if (relatedNotes.length >= limit * 2) break;
      }
    }

    return relatedNotes;
  }

  private findByTagSimilarity(currentNote: KnowledgeNote, limit: number): RelatedNote[] {
    const currentTags = this.parseTags(currentNote.frontmatter_json);
    if (currentTags.length === 0) return [];

    const results = this.repository.findNotesByTagSimilarity(currentNote.id, currentTags, limit);
    const relatedNotes: RelatedNote[] = [];

    for (const note of results) {
      const noteTags = this.parseTags(note.frontmatter_json);
      const commonTags = currentTags.filter((tag) => noteTags.includes(tag));
      const similarity = commonTags.length / Math.max(currentTags.length, noteTags.length);

      relatedNotes.push({
        id: note.id,
        filePath: note.file_path,
        title: note.title,
        similarity,
        reason: `共通タグ: ${commonTags.join(", ")}`,
      });
    }

    return relatedNotes;
  }

  private findByTitleSimilarity(currentNote: KnowledgeNote, limit: number): RelatedNote[] {
    const keywords = this.extractKeywords(currentNote.title);
    if (keywords.length === 0) return [];

    const results = this.repository.findNotesByTitleKeywords(currentNote.id, keywords, limit);
    const relatedNotes: RelatedNote[] = [];

    for (const note of results) {
      const matchedKeywords = keywords.filter((kw) =>
        note.title.toLowerCase().includes(kw.toLowerCase()),
      );
      const similarity = matchedKeywords.length / keywords.length;

      relatedNotes.push({
        id: note.id,
        filePath: note.file_path,
        title: note.title,
        similarity,
        reason: `類似キーワード: ${matchedKeywords.join(", ")}`,
      });
    }

    return relatedNotes;
  }

  private findByTimeProximity(currentNote: KnowledgeNote, limit: number): RelatedNote[] {
    const currentDate = new Date(currentNote.created_at);
    const results = this.repository.findNotesByTimeProximity(
      currentNote.id,
      currentNote.created_at,
      7,
      limit,
    );
    if (results.length === 0) return [];

    const relatedNotes: RelatedNote[] = [];
    const DAY_MS = 1000 * 60 * 60 * 24;

    const allDaysDiffs = results.map((note) => {
      const noteDate = new Date(note.created_at);
      return Math.abs((currentDate.getTime() - noteDate.getTime()) / DAY_MS);
    });

    const sorted = [...allDaysDiffs].sort((a, b) => a - b);
    const medianDiff = sorted[Math.floor(sorted.length / 2)] || 1;
    const lambda = Math.LN2 / Math.max(medianDiff, 0.1);

    // timestamp分散を計算し、低分散時はtime-proximityの重みを自動低減
    const mean = allDaysDiffs.reduce((a, b) => a + b, 0) / allDaysDiffs.length;
    const variance = allDaysDiffs.reduce((a, b) => a + (b - mean) ** 2, 0) / allDaysDiffs.length;
    // 分散が0.01未満（≒全同一timestamp）なら dampening → 0.1、分散が大きくなるにつれ1.0に近づく
    const dampening = Math.min(1.0, Math.sqrt(variance) / 1.0);
    const effectiveDampening = Math.max(dampening, 0.1);

    for (let i = 0; i < results.length; i++) {
      const note = results[i];
      const daysDiff = allDaysDiffs[i];
      const rawSimilarity = Math.exp(-lambda * daysDiff) * 0.8 + 0.2;
      const similarity = rawSimilarity * effectiveDampening;

      relatedNotes.push({
        id: note.id,
        filePath: note.file_path,
        title: note.title,
        similarity,
        reason: `同時期作成 (${Math.floor(daysDiff)}日差)`,
      });
    }

    return relatedNotes;
  }

  private findByProblemSolutionPairs(noteId: number): RelatedNote[] {
    const pairs = this.repository.getProblemSolutionPairsByNoteId(noteId);
    const relatedNotes: RelatedNote[] = [];

    for (const pair of pairs) {
      const relatedNoteId =
        pair.problemNoteId === noteId ? pair.solutionNoteId : pair.problemNoteId;

      if (relatedNoteId === noteId) continue;

      const relatedNote = this.repository.getNoteById(relatedNoteId);
      if (relatedNote) {
        relatedNotes.push({
          id: relatedNote.id,
          filePath: relatedNote.file_path,
          title: relatedNote.title,
          similarity: pair.confidence,
          reason: "問題-解決ペア",
        });
      }
    }

    return relatedNotes;
  }

  private deduplicateAndRank(relatedNotes: RelatedNote[], excludeNoteId: number): RelatedNote[] {
    const noteScores = new Map<number, { scores: number[]; note: RelatedNote }>();

    for (const note of relatedNotes) {
      if (note.id === excludeNoteId) continue;

      if (noteScores.has(note.id)) {
        const entry = noteScores.get(note.id)!;
        entry.scores.push(note.similarity);
        entry.note.reason += `, ${note.reason}`;
      } else {
        noteScores.set(note.id, { scores: [note.similarity], note: { ...note } });
      }
    }

    // max + diminishing boost: 最大スコアをベースに、追加シグナルは (1-max) の一部をブースト
    const BOOST_FACTOR = 0.15;
    for (const entry of noteScores.values()) {
      const sorted = entry.scores.sort((a, b) => b - a);
      let combined = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        combined += (1 - combined) * sorted[i] * BOOST_FACTOR;
      }
      entry.note.similarity = Math.min(combined, 0.99);
    }

    return Array.from(noteScores.values())
      .map((e) => e.note)
      .sort((a, b) => b.similarity - a.similarity);
  }

  private parseTags(frontmatterJson: string | null): string[] {
    if (!frontmatterJson) return [];
    try {
      const frontmatter = JSON.parse(frontmatterJson) as Record<string, unknown>;
      const tags = frontmatter.tags;
      return Array.isArray(tags) ? (tags as string[]) : [];
    } catch {
      return [];
    }
  }

  private extractKeywords(title: string): string[] {
    const words = title
      .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    return Array.from(new Set(words));
  }
}
