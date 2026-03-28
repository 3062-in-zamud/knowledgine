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

    // 全ノートの日数差を計算
    const allDaysDiffs = results.map((note) => {
      const noteDate = new Date(note.created_at);
      return Math.abs((currentDate.getTime() - noteDate.getTime()) / DAY_MS);
    });

    // 中央値をハーフライフとして使用（全て同日の場合は 1 でフォールバック）
    const sorted = [...allDaysDiffs].sort((a, b) => a - b);
    const medianDiff = sorted[Math.floor(sorted.length / 2)] || 1;
    const lambda = Math.LN2 / Math.max(medianDiff, 0.1);

    for (let i = 0; i < results.length; i++) {
      const note = results[i];
      const daysDiff = allDaysDiffs[i];
      // 指数減衰: base 0.2, scale 0.8
      // 全て同日（daysDiff=0）のとき lambda は大きくなるが exp(0)=1 なので similarity = 0.8 * 1 + 0.2 = 1.0
      // medianDiff=0 のとき lambda=Math.LN2/0.1 と大きくなり、daysDiff>0 のノートは急速に減衰する
      const similarity = Math.exp(-lambda * daysDiff) * 0.8 + 0.2;

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
    const noteMap = new Map<number, RelatedNote>();

    for (const note of relatedNotes) {
      if (note.id === excludeNoteId) continue;

      if (noteMap.has(note.id)) {
        const existing = noteMap.get(note.id)!;
        // 確率的結合: 1 - (1-a)(1-b) — 自然に [0, 1] に収まる
        existing.similarity = 1 - (1 - existing.similarity) * (1 - note.similarity);
        existing.reason += `, ${note.reason}`;
      } else {
        noteMap.set(note.id, { ...note });
      }
    }

    return Array.from(noteMap.values()).sort((a, b) => b.similarity - a.similarity);
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
