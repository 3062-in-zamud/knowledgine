import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";

export interface RelatedNote {
  id: number;
  filePath: string;
  title: string;
  similarity: number;
  reason: string;
}

export class LocalLinkGenerator {
  constructor(private repository: KnowledgeRepository) {}

  findRelatedNotes(noteId: number, limit = 5): RelatedNote[] {
    const currentNote = this.repository.getNoteById(noteId);
    if (!currentNote) return [];

    const relatedNotes: RelatedNote[] = [];

    relatedNotes.push(...this.findByTagSimilarity(currentNote, limit * 2));
    relatedNotes.push(...this.findByTitleSimilarity(currentNote, limit * 2));
    relatedNotes.push(...this.findByTimeProximity(currentNote, limit));
    relatedNotes.push(...this.findByProblemSolutionPairs(noteId));

    const uniqueNotes = this.deduplicateAndRank(relatedNotes, noteId);
    return uniqueNotes.slice(0, limit);
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
    const relatedNotes: RelatedNote[] = [];

    for (const note of results) {
      const noteDate = new Date(note.created_at);
      const daysDiff = Math.abs(
        (currentDate.getTime() - noteDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const similarity = Math.max(0, 1 - daysDiff / 7);

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
        existing.similarity = Math.max(existing.similarity, note.similarity);
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
