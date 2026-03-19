import type Database from "better-sqlite3";
import type { KnowledgeData, ExtractedPattern } from "../types.js";
import {
  ValidationError,
  DatabaseError,
  KnowledgeNotFoundError,
  FTSIndexError,
} from "../errors.js";
import { createHash } from "crypto";

export interface KnowledgeNote {
  id: number;
  file_path: string;
  title: string;
  content: string;
  frontmatter_json: string | null;
  created_at: string;
  updated_at: string | null;
  content_hash: string | null;
}

export interface ExtractedPatternRow {
  id: number;
  note_id: number;
  pattern_type: string;
  content: string;
  confidence: number;
  context: string | null;
  line_number: number | null;
  created_at: string;
}

export class KnowledgeRepository {
  constructor(private db: Database.Database) {}

  private computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private validateNoteData(data: KnowledgeData): void {
    if (!data.filePath || typeof data.filePath !== "string" || data.filePath.trim() === "") {
      throw new ValidationError(
        "filePath",
        data.filePath,
        "File path is required and must be a non-empty string",
      );
    }
    if (!data.title || typeof data.title !== "string" || data.title.trim() === "") {
      throw new ValidationError(
        "title",
        data.title,
        "Title is required and must be a non-empty string",
      );
    }
    if (!data.content || typeof data.content !== "string") {
      throw new ValidationError(
        "content",
        data.content,
        "Content is required and must be a string",
      );
    }
  }

  saveNote(data: KnowledgeData): number {
    this.validateNoteData(data);

    try {
      const existing = this.getNoteByPath(data.filePath);
      const now = new Date().toISOString();
      const contentHash = this.computeHash(data.content);
      const frontmatterJson =
        data.frontmatter && Object.keys(data.frontmatter).length > 0
          ? JSON.stringify(data.frontmatter)
          : null;

      if (existing) {
        // Skip update if content hasn't changed
        if (existing.content_hash === contentHash) {
          return existing.id;
        }

        const stmt = this.db.prepare(`
          UPDATE knowledge_notes
          SET title = ?, content = ?, frontmatter_json = ?,
              updated_at = ?, content_hash = ?
          WHERE id = ?
        `);
        stmt.run(data.title, data.content, frontmatterJson, now, contentHash, existing.id);
        return existing.id;
      } else {
        const stmt = this.db.prepare(`
          INSERT INTO knowledge_notes (
            file_path, title, content, frontmatter_json,
            created_at, updated_at, content_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
          data.filePath,
          data.title,
          data.content,
          frontmatterJson,
          data.createdAt || now,
          now,
          contentHash,
        );
        return Number(info.lastInsertRowid);
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError("saveNote", error, { filePath: data.filePath });
    }
  }

  getNoteById(id: number): KnowledgeNote | undefined {
    const stmt = this.db.prepare("SELECT * FROM knowledge_notes WHERE id = ?");
    return stmt.get(id) as KnowledgeNote | undefined;
  }

  getNoteByPath(filePath: string): KnowledgeNote | undefined {
    const stmt = this.db.prepare("SELECT * FROM knowledge_notes WHERE file_path = ?");
    return stmt.get(filePath) as KnowledgeNote | undefined;
  }

  getNoteByIdOrThrow(id: number): KnowledgeNote {
    const note = this.getNoteById(id);
    if (!note) throw new KnowledgeNotFoundError(id, "id");
    return note;
  }

  getNoteByPathOrThrow(filePath: string): KnowledgeNote {
    const note = this.getNoteByPath(filePath);
    if (!note) throw new KnowledgeNotFoundError(filePath, "path");
    return note;
  }

  searchNotes(query: string, limit = 50): KnowledgeNote[] {
    try {
      const stmt = this.db.prepare(`
        SELECT n.*
        FROM knowledge_notes n
        JOIN knowledge_notes_fts fts ON n.id = fts.rowid
        WHERE knowledge_notes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      return stmt.all(query, limit) as KnowledgeNote[];
    } catch (error) {
      throw new FTSIndexError("search", error, { query, limit });
    }
  }

  deleteNoteById(id: number): boolean {
    try {
      const stmt = this.db.prepare("DELETE FROM knowledge_notes WHERE id = ?");
      const info = stmt.run(id);
      return info.changes > 0;
    } catch (error) {
      throw new DatabaseError("deleteNoteById", error, { id });
    }
  }

  deleteNoteByPath(path: string): boolean {
    try {
      const stmt = this.db.prepare("DELETE FROM knowledge_notes WHERE file_path = ?");
      const info = stmt.run(path);
      return info.changes > 0;
    } catch (error) {
      throw new DatabaseError("deleteNoteByPath", error, { path });
    }
  }

  savePatterns(noteId: number, patterns: ExtractedPattern[]): void {
    if (!noteId || typeof noteId !== "number" || noteId <= 0) {
      throw new ValidationError("noteId", noteId, "Note ID must be a positive number");
    }
    if (!Array.isArray(patterns)) {
      throw new ValidationError("patterns", patterns, "Patterns must be an array");
    }

    try {
      const deleteStmt = this.db.prepare("DELETE FROM extracted_patterns WHERE note_id = ?");
      deleteStmt.run(noteId);

      const insertStmt = this.db.prepare(`
        INSERT INTO extracted_patterns (
          note_id, pattern_type, content, confidence,
          context, line_number, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();
      for (const pattern of patterns) {
        insertStmt.run(
          noteId,
          pattern.type,
          pattern.content,
          pattern.confidence,
          pattern.context ?? null,
          pattern.lineNumber ?? null,
          now,
        );
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError("savePatterns", error, { noteId });
    }
  }

  getPatternsByNoteId(noteId: number): ExtractedPatternRow[] {
    const stmt = this.db.prepare(
      "SELECT * FROM extracted_patterns WHERE note_id = ? ORDER BY line_number",
    );
    return stmt.all(noteId) as ExtractedPatternRow[];
  }

  saveProblemSolutionPairs(
    pairs: Array<{
      problemPatternId: number;
      solutionPatternId: number;
      relevanceScore: number;
    }>,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO problem_solution_pairs (
        problem_pattern_id, solution_pattern_id, relevance_score, created_at
      ) VALUES (?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const pair of pairs) {
      stmt.run(pair.problemPatternId, pair.solutionPatternId, pair.relevanceScore, now);
    }
  }

  saveNoteLinks(
    links: Array<{
      sourceNoteId: number;
      targetNoteId: number;
      linkType: string;
      similarity?: number;
    }>,
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO note_links (
        source_note_id, target_note_id, link_type, similarity, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const link of links) {
      stmt.run(link.sourceNoteId, link.targetNoteId, link.linkType, link.similarity ?? null, now);
    }
  }

  getNoteLinks(noteId: number): Array<{
    targetNoteId: number;
    linkType: string;
    similarity: number | null;
  }> {
    const stmt = this.db.prepare(`
      SELECT target_note_id as targetNoteId, link_type as linkType, similarity
      FROM note_links WHERE source_note_id = ?
      ORDER BY similarity DESC
    `);
    return stmt.all(noteId) as Array<{
      targetNoteId: number;
      linkType: string;
      similarity: number | null;
    }>;
  }

  getProblemSolutionPairsByNoteId(noteId: number): Array<{
    id: number;
    problemNoteId: number;
    solutionNoteId: number;
    problemPattern: string;
    solutionPattern: string;
    confidence: number;
  }> {
    // Join through extracted_patterns to find pairs associated with this note's patterns
    const stmt = this.db.prepare(`
      SELECT psp.id,
        ep_problem.note_id as problemNoteId,
        ep_solution.note_id as solutionNoteId,
        ep_problem.content as problemPattern,
        ep_solution.content as solutionPattern,
        psp.relevance_score as confidence
      FROM problem_solution_pairs psp
      JOIN extracted_patterns ep_problem ON psp.problem_pattern_id = ep_problem.id
      JOIN extracted_patterns ep_solution ON psp.solution_pattern_id = ep_solution.id
      WHERE ep_problem.note_id = ? OR ep_solution.note_id = ?
    `);
    return stmt.all(noteId, noteId) as Array<{
      id: number;
      problemNoteId: number;
      solutionNoteId: number;
      problemPattern: string;
      solutionPattern: string;
      confidence: number;
    }>;
  }

  findNotesByTagSimilarity(noteId: number, tags: string[], limit: number): KnowledgeNote[] {
    // Search notes that share tags via frontmatter_json
    const conditions = tags.map(() => "n.frontmatter_json LIKE ?").join(" OR ");
    const params = tags.map((tag) => `%"${tag}"%`);

    const stmt = this.db.prepare(`
      SELECT n.* FROM knowledge_notes n
      WHERE n.id != ? AND (${conditions})
      LIMIT ?
    `);
    return stmt.all(noteId, ...params, limit) as KnowledgeNote[];
  }

  findNotesByTitleKeywords(noteId: number, keywords: string[], limit: number): KnowledgeNote[] {
    const conditions = keywords.map(() => "n.title LIKE ?").join(" OR ");
    const params = keywords.map((kw) => `%${kw}%`);

    const stmt = this.db.prepare(`
      SELECT n.* FROM knowledge_notes n
      WHERE n.id != ? AND (${conditions})
      LIMIT ?
    `);
    return stmt.all(noteId, ...params, limit) as KnowledgeNote[];
  }

  findNotesByTimeProximity(
    noteId: number,
    createdAt: string,
    days: number,
    limit: number,
  ): KnowledgeNote[] {
    const stmt = this.db.prepare(`
      SELECT * FROM knowledge_notes
      WHERE id != ?
        AND ABS(julianday(created_at) - julianday(?)) <= ?
      ORDER BY ABS(julianday(created_at) - julianday(?))
      LIMIT ?
    `);
    return stmt.all(noteId, createdAt, days, createdAt, limit) as KnowledgeNote[];
  }

  getStats(): {
    totalNotes: number;
    totalPatterns: number;
    totalLinks: number;
    totalPairs: number;
    patternsByType: Record<string, number>;
  } {
    const totalNotes = (
      this.db.prepare("SELECT COUNT(*) as count FROM knowledge_notes").get() as { count: number }
    ).count;
    const totalPatterns = (
      this.db.prepare("SELECT COUNT(*) as count FROM extracted_patterns").get() as { count: number }
    ).count;
    const totalLinks = (
      this.db.prepare("SELECT COUNT(*) as count FROM note_links").get() as { count: number }
    ).count;
    const totalPairs = (
      this.db.prepare("SELECT COUNT(*) as count FROM problem_solution_pairs").get() as {
        count: number;
      }
    ).count;

    const typeRows = this.db
      .prepare(
        "SELECT pattern_type, COUNT(*) as count FROM extracted_patterns GROUP BY pattern_type",
      )
      .all() as Array<{ pattern_type: string; count: number }>;

    const patternsByType: Record<string, number> = {};
    for (const row of typeRows) {
      patternsByType[row.pattern_type] = row.count;
    }

    return { totalNotes, totalPatterns, totalLinks, totalPairs, patternsByType };
  }

  close(): void {
    this.db.close();
  }
}
