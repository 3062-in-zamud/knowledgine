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

  /**
   * ノートの埋め込みベクトルを保存する（upsert）
   */
  saveEmbedding(noteId: number, embedding: Float32Array, modelName: string): void {
    try {
      const now = new Date().toISOString();
      const embBuf = Buffer.from(embedding.buffer);

      // note_embeddings テーブルに upsert
      const upsertStmt = this.db.prepare(`
        INSERT INTO note_embeddings (note_id, embedding, model_name, dimensions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(note_id) DO UPDATE SET
          embedding = excluded.embedding,
          model_name = excluded.model_name,
          dimensions = excluded.dimensions,
          updated_at = excluded.updated_at
      `);
      upsertStmt.run(noteId, embBuf, modelName, embedding.length, now, now);

      // note_embeddings_vec (vec0) が存在する場合は手動で同期
      // vec0 は ON CONFLICT をサポートしないため DELETE + INSERT を使う
      try {
        this.db.prepare("DELETE FROM note_embeddings_vec WHERE note_id = ?").run(noteId);
        this.db
          .prepare("INSERT INTO note_embeddings_vec(note_id, embedding) VALUES (?, ?)")
          .run(noteId, embBuf);
      } catch {
        // note_embeddings_vec が存在しない場合は無視（graceful degradation）
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("saveEmbedding", error, { noteId });
    }
  }

  /**
   * ベクトル類似度検索（note_embeddings_vec を使用）
   * sqlite-vec が利用できない場合は空配列を返す
   */
  searchByVector(
    embedding: Float32Array,
    limit: number = 10,
  ): Array<{ note_id: number; distance: number }> {
    try {
      const buf = Buffer.from(embedding.buffer);
      const stmt = this.db.prepare(`
        SELECT note_id, distance
        FROM note_embeddings_vec
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      `);
      return stmt.all(buf, limit) as Array<{ note_id: number; distance: number }>;
    } catch {
      // vec0テーブルが存在しない場合（sqlite-vec未ロード）は空を返す
      return [];
    }
  }

  /**
   * FTS5 rank付きでノートを検索する
   */
  searchNotesWithRank(
    query: string,
    limit: number = 50,
  ): Array<{ note: KnowledgeNote; rank: number }> {
    try {
      const stmt = this.db.prepare(`
        SELECT n.*, fts.rank
        FROM knowledge_notes n
        JOIN knowledge_notes_fts fts ON n.id = fts.rowid
        WHERE knowledge_notes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      const rows = stmt.all(query, limit) as Array<KnowledgeNote & { rank: number }>;
      return rows.map(({ rank, ...note }) => ({ note: note as KnowledgeNote, rank }));
    } catch (error) {
      throw new FTSIndexError("search", error, { query, limit });
    }
  }

  /**
   * 埋め込みがまだ生成されていないノートを取得する
   */
  getNotesWithoutEmbeddings(): KnowledgeNote[] {
    const stmt = this.db.prepare(`
      SELECT n.* FROM knowledge_notes n
      WHERE NOT EXISTS (SELECT 1 FROM note_embeddings e WHERE e.note_id = n.id)
    `);
    return stmt.all() as KnowledgeNote[];
  }

  /**
   * content_hashが変更されて埋め込みが古くなったノートを取得する
   */
  getNotesWithStaleEmbeddings(): KnowledgeNote[] {
    // note_embeddingsのupdated_atとknowledge_notesのupdated_atを比較
    const stmt = this.db.prepare(`
      SELECT n.* FROM knowledge_notes n
      JOIN note_embeddings e ON e.note_id = n.id
      WHERE n.updated_at IS NOT NULL AND n.updated_at > e.created_at
    `);
    return stmt.all() as KnowledgeNote[];
  }

  close(): void {
    this.db.close();
  }
}
