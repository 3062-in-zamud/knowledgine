import type Database from "better-sqlite3";
import type { KnowledgeData, ExtractedPattern } from "../types.js";
import { ValidationError, DatabaseError, KnowledgeNotFoundError } from "../errors.js";
import { createHash } from "crypto";
import { hasCjk as hasCjkChars } from "../utils/cjk.js";

export interface KnowledgeNote {
  id: number;
  file_path: string;
  title: string;
  content: string;
  frontmatter_json: string | null;
  created_at: string;
  updated_at: string | null;
  content_hash: string | null;
  // migration 008: knowledge versioning
  version: number | null;
  supersedes: number | null;
  valid_from: string | null;
  deprecated: 0 | 1 | null;
  deprecation_reason: string | null;
  // migration 009: extraction metadata
  extracted_at: string | null;
  code_location_json: string | null;
}

export type KnowledgeNoteSummary = Omit<KnowledgeNote, "content" | "frontmatter_json">;

const SUMMARY_COLUMNS = `id, file_path, title, created_at, updated_at, content_hash,
  version, supersedes, valid_from, deprecated, deprecation_reason,
  extracted_at, code_location_json`;

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
  private _stmtCache = new Map<string, Database.Statement>();
  private _resultCache = new Map<string, { data: unknown; timestamp: number }>();
  private static readonly CACHE_MAX_SIZE = 256;
  private static readonly CACHE_TTL_MS = 5000; // 5 seconds

  constructor(private db: Database.Database) {}

  private getCachedResult<T>(key: string): T | null {
    const entry = this._resultCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > KnowledgeRepository.CACHE_TTL_MS) {
      this._resultCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCachedResult<T>(key: string, data: T): void {
    if (this._resultCache.size >= KnowledgeRepository.CACHE_MAX_SIZE) {
      const firstKey = this._resultCache.keys().next().value;
      if (firstKey) this._resultCache.delete(firstKey);
    }
    this._resultCache.set(key, { data, timestamp: Date.now() });
  }

  clearResultCache(): void {
    this._resultCache.clear();
  }

  private stmt(sql: string): Database.Statement {
    let s = this._stmtCache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this._stmtCache.set(sql, s);
    }
    return s;
  }

  clearStatementCache(): void {
    this._stmtCache.clear();
  }

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

      const codeLocationJson = data.codeLocationJson ?? null;

      if (existing) {
        // Skip update if content hasn't changed
        if (existing.content_hash === contentHash) {
          return existing.id;
        }

        this.stmt(
          `
          UPDATE knowledge_notes
          SET title = ?, content = ?, frontmatter_json = ?,
              updated_at = ?, content_hash = ?, code_location_json = ?
          WHERE id = ?
        `,
        ).run(
          data.title,
          data.content,
          frontmatterJson,
          now,
          contentHash,
          codeLocationJson,
          existing.id,
        );
        this.clearResultCache();
        return existing.id;
      } else {
        const info = this.stmt(
          `
          INSERT INTO knowledge_notes (
            file_path, title, content, frontmatter_json,
            created_at, updated_at, content_hash, code_location_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          data.filePath,
          data.title,
          data.content,
          frontmatterJson,
          data.createdAt || now,
          now,
          contentHash,
          codeLocationJson,
        );
        this.clearResultCache();
        return Number(info.lastInsertRowid);
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError("saveNote", error, { filePath: data.filePath });
    }
  }

  getNoteById(id: number): KnowledgeNote | undefined {
    return this.stmt("SELECT * FROM knowledge_notes WHERE id = ?").get(id) as
      | KnowledgeNote
      | undefined;
  }

  getNoteByPath(filePath: string): KnowledgeNote | undefined {
    return this.stmt("SELECT * FROM knowledge_notes WHERE file_path = ?").get(filePath) as
      | KnowledgeNote
      | undefined;
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
      return this.stmt(
        `
        SELECT n.*
        FROM knowledge_notes n
        JOIN knowledge_notes_fts fts ON n.id = fts.rowid
        WHERE knowledge_notes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
      ).all(query, limit) as KnowledgeNote[];
    } catch {
      // FTS5失敗時はLIKEフォールバック（不正なクエリ構文への耐性）
      return this.stmt(
        `SELECT * FROM knowledge_notes WHERE title LIKE ? OR content LIKE ? LIMIT ?`,
      ).all(`%${query}%`, `%${query}%`, limit) as KnowledgeNote[];
    }
  }

  deleteNoteById(id: number): boolean {
    try {
      const info = this.stmt("DELETE FROM knowledge_notes WHERE id = ?").run(id);
      if (info.changes > 0) this.clearResultCache();
      return info.changes > 0;
    } catch (error) {
      throw new DatabaseError("deleteNoteById", error, { id });
    }
  }

  deleteNoteByPath(path: string): boolean {
    try {
      const info = this.stmt("DELETE FROM knowledge_notes WHERE file_path = ?").run(path);
      if (info.changes > 0) this.clearResultCache();
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
      const now = new Date().toISOString();
      const savePatternsTransaction = this.db.transaction(() => {
        this.stmt("DELETE FROM extracted_patterns WHERE note_id = ?").run(noteId);

        const insertSql = `
          INSERT INTO extracted_patterns (
            note_id, pattern_type, content, confidence,
            context, line_number, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        for (const pattern of patterns) {
          this.stmt(insertSql).run(
            noteId,
            pattern.type,
            pattern.content,
            pattern.confidence,
            pattern.context ?? null,
            pattern.lineNumber ?? null,
            now,
          );
        }
      });
      savePatternsTransaction();
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError("savePatterns", error, { noteId });
    }
  }

  getPatternsByNoteId(noteId: number): ExtractedPatternRow[] {
    return this.stmt("SELECT * FROM extracted_patterns WHERE note_id = ? ORDER BY line_number").all(
      noteId,
    ) as ExtractedPatternRow[];
  }

  saveProblemSolutionPairs(
    pairs: Array<{
      problemPatternId: number;
      solutionPatternId: number;
      relevanceScore: number;
    }>,
  ): void {
    const now = new Date().toISOString();
    for (const pair of pairs) {
      this.stmt(
        `
        INSERT INTO problem_solution_pairs (
          problem_pattern_id, solution_pattern_id, relevance_score, created_at
        ) VALUES (?, ?, ?, ?)
      `,
      ).run(pair.problemPatternId, pair.solutionPatternId, pair.relevanceScore, now);
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
    const now = new Date().toISOString();
    for (const link of links) {
      this.stmt(
        `
        INSERT OR REPLACE INTO note_links (
          source_note_id, target_note_id, link_type, similarity, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      ).run(link.sourceNoteId, link.targetNoteId, link.linkType, link.similarity ?? null, now);
    }
  }

  getNoteLinks(noteId: number): Array<{
    targetNoteId: number;
    linkType: string;
    similarity: number | null;
  }> {
    return this.stmt(
      `
      SELECT target_note_id as targetNoteId, link_type as linkType, similarity
      FROM note_links WHERE source_note_id = ?
      ORDER BY similarity DESC
    `,
    ).all(noteId) as Array<{
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
    return this.stmt(
      `
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
    `,
    ).all(noteId, noteId) as Array<{
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
    notesBySource: Record<string, number>;
  } {
    const totalNotes = (
      this.stmt("SELECT COUNT(*) as count FROM knowledge_notes").get() as { count: number }
    ).count;
    const totalPatterns = (
      this.stmt("SELECT COUNT(*) as count FROM extracted_patterns").get() as { count: number }
    ).count;
    const totalLinks = (
      this.stmt("SELECT COUNT(*) as count FROM note_links").get() as { count: number }
    ).count;
    const totalPairs = (
      this.stmt("SELECT COUNT(*) as count FROM problem_solution_pairs").get() as {
        count: number;
      }
    ).count;

    const typeRows = this.stmt(
      "SELECT pattern_type, COUNT(*) as count FROM extracted_patterns GROUP BY pattern_type",
    ).all() as Array<{ pattern_type: string; count: number }>;

    const patternsByType: Record<string, number> = {};
    for (const row of typeRows) {
      patternsByType[row.pattern_type] = row.count;
    }

    // Source breakdown (source_type may be NULL for pre-migration notes)
    const sourceRows = this.db
      .prepare(
        "SELECT COALESCE(source_type, 'markdown') as source, COUNT(*) as count FROM knowledge_notes GROUP BY COALESCE(source_type, 'markdown')",
      )
      .all() as Array<{ source: string; count: number }>;
    const notesBySource: Record<string, number> = {};
    for (const row of sourceRows) {
      notesBySource[row.source] = row.count;
    }

    return { totalNotes, totalPatterns, totalLinks, totalPairs, patternsByType, notesBySource };
  }

  /**
   * コードファイルパスで code_location_json を持つノートを検索する
   * path パラメータを含む code_location_json が NULL でないノートを返す
   */
  searchByCodeLocation(path: string): KnowledgeNote[] {
    return this.stmt(
      `
      SELECT * FROM knowledge_notes
      WHERE code_location_json IS NOT NULL
        AND code_location_json LIKE ?
      ORDER BY created_at DESC
    `,
    ).all(`%${path}%`) as KnowledgeNote[];
  }

  /**
   * ノートの埋め込みベクトルを保存する（upsert）
   */
  saveEmbedding(noteId: number, embedding: Float32Array, modelName: string): void {
    try {
      const now = new Date().toISOString();
      const embBuf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);

      const saveEmbeddingTransaction = this.db.transaction(() => {
        // note_embeddings テーブルに upsert
        this.stmt(
          `
          INSERT INTO note_embeddings (note_id, embedding, model_name, dimensions, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(note_id) DO UPDATE SET
            embedding = excluded.embedding,
            model_name = excluded.model_name,
            dimensions = excluded.dimensions,
            updated_at = excluded.updated_at
        `,
        ).run(noteId, embBuf, modelName, embedding.length, now, now);

        // note_embeddings_vec (vec0) が存在する場合は手動で同期
        // vec0 は ON CONFLICT をサポートしないため DELETE + INSERT を使う
        try {
          this.stmt("DELETE FROM note_embeddings_vec WHERE note_id = CAST(? AS INTEGER)").run(
            noteId,
          );
          this.stmt(
            "INSERT INTO note_embeddings_vec(note_id, embedding) VALUES (CAST(? AS INTEGER), ?)",
          ).run(noteId, embBuf);
        } catch {
          // note_embeddings_vec が存在しない場合は無視（graceful degradation）
        }
      });
      saveEmbeddingTransaction();
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("saveEmbedding", error, { noteId });
    }
  }

  /**
   * 複数ノートの埋め込みベクトルをバッチ保存する
   * 100件単位のチャンクトランザクションで処理し、チャンク失敗時は1件ずつフォールバック
   */
  saveEmbeddingBatch(
    items: Array<{ noteId: number; embedding: Float32Array; modelName: string }>,
  ): { saved: number; failed: number } {
    if (items.length === 0) return { saved: 0, failed: 0 };

    // vec0 利用可否を事前に1回だけチェック
    let vec0Available = true;
    try {
      this.db.prepare("SELECT COUNT(*) FROM note_embeddings_vec").get();
    } catch {
      vec0Available = false;
    }

    const CHUNK_SIZE = 100;
    let saved = 0;
    let failed = 0;
    const now = new Date().toISOString();

    const upsertStmt = this.stmt(`
      INSERT INTO note_embeddings (note_id, embedding, model_name, dimensions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(note_id) DO UPDATE SET
        embedding = excluded.embedding,
        model_name = excluded.model_name,
        dimensions = excluded.dimensions,
        updated_at = excluded.updated_at
    `);
    const vecDeleteStmt = vec0Available
      ? this.stmt("DELETE FROM note_embeddings_vec WHERE note_id = CAST(? AS INTEGER)")
      : null;
    const vecInsertStmt = vec0Available
      ? this.stmt(
          "INSERT INTO note_embeddings_vec(note_id, embedding) VALUES (CAST(? AS INTEGER), ?)",
        )
      : null;

    const saveOne = (item: {
      noteId: number;
      embedding: Float32Array;
      modelName: string;
    }): void => {
      const embBuf = Buffer.from(
        item.embedding.buffer,
        item.embedding.byteOffset,
        item.embedding.byteLength,
      );
      upsertStmt.run(item.noteId, embBuf, item.modelName, item.embedding.length, now, now);
      if (vec0Available && vecDeleteStmt && vecInsertStmt) {
        try {
          vecDeleteStmt.run(item.noteId);
          vecInsertStmt.run(item.noteId, embBuf);
        } catch {
          // vec0 操作失敗は無視（graceful degradation）
        }
      }
    };

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      try {
        const chunkTransaction = this.db.transaction(() => {
          for (const item of chunk) {
            saveOne(item);
          }
        });
        chunkTransaction();
        saved += chunk.length;
      } catch {
        // チャンク失敗時は1件ずつフォールバック
        for (const item of chunk) {
          try {
            const singleTransaction = this.db.transaction(() => {
              saveOne(item);
            });
            singleTransaction();
            saved++;
          } catch {
            failed++;
          }
        }
      }
    }

    return { saved, failed };
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
      const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
      return this.stmt(
        `
        SELECT note_id, distance
        FROM note_embeddings_vec
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      `,
      ).all(buf, limit) as Array<{ note_id: number; distance: number }>;
    } catch {
      // vec0テーブルが存在しない場合（sqlite-vec未ロード）は空を返す
      return [];
    }
  }

  /**
   * Transform a user query into FTS5-compatible syntax.
   * - "quoted phrases" are preserved as-is (FTS5 natively supports them)
   * - `OR` between terms is preserved
   * - All other terms are implicitly AND-joined (FTS5 default)
   * - Special FTS5 characters are escaped
   */
  private transformQueryToFts5(query: string): string {
    // Preserve quoted phrases by extracting them first
    const phrases: string[] = [];
    const remaining = query.replace(/"([^"]+)"/g, (_match, phrase) => {
      phrases.push(`"${phrase}"`);
      return `__PHRASE_${phrases.length - 1}__`;
    });

    // Split by OR (case-sensitive to avoid matching words like "for")
    const orParts = remaining.split(/\bOR\b/);

    const fts5Parts = orParts.map((part) => {
      // Split into tokens
      const tokens = part.trim().split(/\s+/).filter(Boolean);
      return tokens
        .map((t) => {
          // Replace phrase placeholders
          const phMatch = t.match(/^__PHRASE_(\d+)__$/);
          if (phMatch) return phrases[parseInt(phMatch[1])];
          // Escape FTS5 special characters in regular terms
          return t.replace(/[*^"]/g, "");
        })
        .join(" ");
    });

    return fts5Parts.join(" OR ");
  }

  /**
   * FTS5 rank付きでノートを検索する
   */
  searchNotesWithRank(
    query: string,
    limit: number = 50,
    includeDeprecated: boolean = false,
    dateFrom?: string,
    dateTo?: string,
  ): Array<{ note: KnowledgeNote; rank: number }> {
    const cacheKey = `search:${query}:${limit}:${includeDeprecated}:${dateFrom ?? ""}:${dateTo ?? ""}`;
    const cached = this.getCachedResult<Array<{ note: KnowledgeNote; rank: number }>>(cacheKey);
    if (cached) return cached;

    const deprecatedFilter = includeDeprecated ? "" : "AND n.deprecated = 0";
    const dateFromFilter = dateFrom ? "AND n.created_at >= ?" : "";
    const dateToFilter = dateTo ? "AND n.created_at <= ?" : "";
    const dateParams: string[] = [];
    if (dateFrom) dateParams.push(dateFrom);
    if (dateTo) dateParams.push(dateTo);

    // Transform user query into FTS5-compatible syntax (OR, quoted phrases, escaping)
    const ftsQuery = this.transformQueryToFts5(query);

    // CJK文字を含むクエリはtrigramテーブルを優先使用（trigramは最低3文字必要）
    const isCjk = hasCjkChars(query);
    // Short CJK queries (1-2 chars) → LIKE directly (FTS5 can't tokenize these properly)
    if (isCjk && query.replace(/\s/g, "").length <= 2) {
      return this.searchNotesWithLike(query, limit, includeDeprecated, dateFrom, dateTo);
    }
    const useTrigram = isCjk && query.length >= 3;
    const ftsTable = useTrigram ? "knowledge_notes_fts_trigram" : "knowledge_notes_fts";

    try {
      const rows = this.stmt(
        `
        SELECT n.*, bm25(${ftsTable}, 10.0, 1.0) AS rank
        FROM knowledge_notes n
        JOIN ${ftsTable} fts ON n.id = fts.rowid
        WHERE ${ftsTable} MATCH ?
        ${deprecatedFilter}
        ${dateFromFilter}
        ${dateToFilter}
        ORDER BY rank
        LIMIT ?
      `,
      ).all(ftsQuery, ...dateParams, limit * 3) as Array<KnowledgeNote & { rank: number }>;

      // CJKクエリでunicode61が0件の場合はLIKEフォールバック（短いCJKトークンの救済）
      if (rows.length === 0 && isCjk) {
        return this.searchNotesWithLike(query, limit, includeDeprecated, dateFrom, dateTo);
      }

      const results = rows
        .slice(0, limit)
        .map(({ rank, ...note }) => ({ note: note as KnowledgeNote, rank }));
      this.setCachedResult(cacheKey, results);
      return results;
    } catch {
      return this.searchNotesWithLike(query, limit, includeDeprecated, dateFrom, dateTo);
    }
  }

  private searchNotesWithLike(
    query: string,
    limit: number,
    includeDeprecated: boolean,
    dateFrom?: string,
    dateTo?: string,
  ): Array<{ note: KnowledgeNote; rank: number }> {
    const deprecatedClause = includeDeprecated ? "" : "AND n.deprecated = 0";
    const dateFromFilter = dateFrom ? "AND n.created_at >= ?" : "";
    const dateToFilter = dateTo ? "AND n.created_at <= ?" : "";
    const dateParams: string[] = [];
    if (dateFrom) dateParams.push(dateFrom);
    if (dateTo) dateParams.push(dateTo);

    const fallbackRows = this.stmt(
      `SELECT n.* FROM knowledge_notes n WHERE (n.title LIKE ? OR n.content LIKE ?) ${deprecatedClause} ${dateFromFilter} ${dateToFilter} LIMIT ?`,
    ).all(`%${query}%`, `%${query}%`, ...dateParams, limit) as Array<
      KnowledgeNote & { rank: number }
    >;
    return fallbackRows.map((row) => ({ note: row as KnowledgeNote, rank: 0 }));
  }

  /**
   * FTS5 rank付き + スニペット付きでノートを検索する。
   * searchNotesWithRank の拡張版で、FTS5 snippet() によるコンテキスト抜粋を含む。
   */
  searchNotesWithSnippet(
    query: string,
    limit: number = 50,
    includeDeprecated: boolean = false,
    dateFrom?: string,
    dateTo?: string,
  ): Array<{ note: KnowledgeNote; rank: number; snippet?: string }> {
    const hasCjk = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(query);

    // Short CJK (1-2 chars) → LIKE with JS snippet
    if (hasCjk && query.replace(/\s/g, "").length <= 2) {
      return this.searchNotesWithLikeSnippet(query, limit, includeDeprecated, dateFrom, dateTo);
    }

    const deprecatedFilter = includeDeprecated ? "" : "AND n.deprecated = 0";
    const dateFromFilter = dateFrom ? "AND n.created_at >= ?" : "";
    const dateToFilter = dateTo ? "AND n.created_at <= ?" : "";
    const dateParams: string[] = [];
    if (dateFrom) dateParams.push(dateFrom);
    if (dateTo) dateParams.push(dateTo);

    const useTrigram = hasCjk && query.length >= 3;
    const ftsTable = useTrigram ? "knowledge_notes_fts_trigram" : "knowledge_notes_fts";

    const ftsQuery = this.transformQueryToFts5(query);

    try {
      // Use FTS5 snippet() function with Unicode markers for highlighting
      const rows = this.stmt(
        `
        SELECT n.*, bm25(${ftsTable}, 10.0, 1.0) AS rank,
               snippet(${ftsTable}, 1, '\uFFF0', '\uFFF1', '...', 32) AS snippet
        FROM knowledge_notes n
        JOIN ${ftsTable} fts ON n.id = fts.rowid
        WHERE ${ftsTable} MATCH ?
        ${deprecatedFilter}
        ${dateFromFilter}
        ${dateToFilter}
        ORDER BY rank
        LIMIT ?
      `,
      ).all(ftsQuery, ...dateParams, limit * 3) as Array<
        KnowledgeNote & { rank: number; snippet: string }
      >;

      if (rows.length === 0 && hasCjk) {
        return this.searchNotesWithLikeSnippet(query, limit, includeDeprecated, dateFrom, dateTo);
      }

      return rows.slice(0, limit).map(({ rank, snippet, ...note }) => ({
        note: note as KnowledgeNote,
        rank,
        snippet: snippet || undefined,
      }));
    } catch {
      return this.searchNotesWithLikeSnippet(query, limit, includeDeprecated, dateFrom, dateTo);
    }
  }

  /**
   * LIKE-based search with JS-generated snippets.
   * Used when FTS5 is unavailable or for short CJK queries.
   */
  private searchNotesWithLikeSnippet(
    query: string,
    limit: number,
    includeDeprecated: boolean,
    dateFrom?: string,
    dateTo?: string,
  ): Array<{ note: KnowledgeNote; rank: number; snippet?: string }> {
    const results = this.searchNotesWithLike(query, limit, includeDeprecated, dateFrom, dateTo);
    return results.map(({ note, rank }) => ({
      note,
      rank,
      snippet: this.generateJsSnippet(note.content, query),
    }));
  }

  /**
   * Generate a snippet by finding query text in content and extracting surrounding context.
   */
  private generateJsSnippet(content: string, query: string): string | undefined {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerContent.indexOf(lowerQuery);
    if (idx === -1) return undefined;

    const CONTEXT_CHARS = 50;
    const start = Math.max(0, idx - CONTEXT_CHARS);
    const end = Math.min(content.length, idx + query.length + CONTEXT_CHARS);

    let snippet = "";
    if (start > 0) snippet += "...";
    const before = content.slice(start, idx);
    const match = content.slice(idx, idx + query.length);
    const after = content.slice(idx + query.length, end);
    snippet += before + "\uFFF0" + match + "\uFFF1" + after;
    if (end < content.length) snippet += "...";

    return snippet;
  }

  /**
   * 埋め込みがまだ生成されていないノートを取得する
   */
  getNotesWithoutEmbeddings(): KnowledgeNote[] {
    return this.stmt(
      `
      SELECT n.* FROM knowledge_notes n
      WHERE NOT EXISTS (SELECT 1 FROM note_embeddings e WHERE e.note_id = n.id)
    `,
    ).all() as KnowledgeNote[];
  }

  /**
   * content_hashが変更されて埋め込みが古くなったノートを取得する
   */
  getNotesWithStaleEmbeddings(): KnowledgeNote[] {
    // note_embeddingsのupdated_atとknowledge_notesのupdated_atを比較
    return this.stmt(
      `
      SELECT n.* FROM knowledge_notes n
      JOIN note_embeddings e ON e.note_id = n.id
      WHERE n.updated_at IS NOT NULL AND n.updated_at > e.created_at
    `,
    ).all() as KnowledgeNote[];
  }

  /**
   * 指定プレフィックスで始まる file_path を持つノートを取得する
   */
  getNotesWithPrefix(prefix: string, limit: number = 100): KnowledgeNote[] {
    return this.stmt(
      "SELECT * FROM knowledge_notes WHERE file_path LIKE ? ORDER BY created_at DESC LIMIT ?",
    ).all(`${prefix}%`, limit) as KnowledgeNote[];
  }

  /**
   * 全ノートを取得する
   */
  getAllNotes(): KnowledgeNote[] {
    return this.stmt("SELECT * FROM knowledge_notes").all() as KnowledgeNote[];
  }

  /**
   * 全ノートの ID のみを取得する（content をロードしないため OOM 対策）
   */
  getAllNoteIds(): number[] {
    return this.stmt("SELECT id FROM knowledge_notes").pluck().all() as number[];
  }

  /**
   * 埋め込みがまだ生成されていないノートの ID のみを取得する（OOM 対策）
   */
  getNotesWithoutEmbeddingIds(): number[] {
    return this.stmt(
      "SELECT n.id FROM knowledge_notes n WHERE NOT EXISTS (SELECT 1 FROM note_embeddings e WHERE e.note_id = n.id)",
    )
      .pluck()
      .all() as number[];
  }

  /**
   * 特定のソースプラグインで作成されたノートを取得する
   * frontmatter_json 内の source_plugin フィールドで絞り込む
   */
  getNotesBySourcePlugin(pluginId: string): KnowledgeNote[] {
    return this.stmt(`SELECT * FROM knowledge_notes WHERE frontmatter_json LIKE ?`).all(
      `%"source_plugin":"${pluginId}"%`,
    ) as KnowledgeNote[];
  }

  /**
   * 指定IDリストのノートを一括削除する
   */
  deleteNotesByIds(ids: number[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(",");
    const info = this.db
      .prepare(`DELETE FROM knowledge_notes WHERE id IN (${placeholders})`)
      .run(...ids);
    return info.changes;
  }

  /**
   * ノートの extracted_at タイムスタンプを更新する
   */
  updateExtractedAt(noteId: number): void {
    const now = new Date().toISOString();
    this.stmt("UPDATE knowledge_notes SET extracted_at = ? WHERE id = ?").run(now, noteId);
  }

  /**
   * sourceUri プレフィックスでノートを取得する
   * file_path が sourceUri として使われている（normalizer.ts の仕様）
   */
  getNotesBySourceUriPrefix(prefix: string): KnowledgeNote[] {
    return this.stmt(
      "SELECT * FROM knowledge_notes WHERE file_path LIKE ? ORDER BY created_at ASC",
    ).all(`${prefix}%`) as KnowledgeNote[];
  }

  /**
   * 既存リンクチェック後に note_links へ INSERT する（冪等）
   * 同じ source/target ペアが既に存在する場合は false を返す
   */
  saveNoteLinkIfNotExists(
    sourceNoteId: number,
    targetNoteId: number,
    linkType: string,
    similarity?: number,
  ): boolean {
    const existing = this.stmt(
      "SELECT id FROM note_links WHERE source_note_id = ? AND target_note_id = ?",
    ).get(sourceNoteId, targetNoteId);

    if (existing) return false;

    const now = new Date().toISOString();
    this.stmt(
      "INSERT INTO note_links (source_note_id, target_note_id, link_type, similarity, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(sourceNoteId, targetNoteId, linkType, similarity ?? null, now);

    return true;
  }

  /**
   * 指定ノートに関するリンクをすべて取得する（source または target）
   */
  getLinksForNote(noteId: number): Array<{
    id: number;
    sourceNoteId: number;
    targetNoteId: number;
    linkType: string;
    similarity: number | null;
    createdAt: string;
  }> {
    return this.stmt(
      `
      SELECT id, source_note_id as sourceNoteId, target_note_id as targetNoteId,
             link_type as linkType, similarity, created_at as createdAt
      FROM note_links
      WHERE source_note_id = ? OR target_note_id = ?
      ORDER BY created_at DESC
    `,
    ).all(noteId, noteId) as Array<{
      id: number;
      sourceNoteId: number;
      targetNoteId: number;
      linkType: string;
      similarity: number | null;
      createdAt: string;
    }>;
  }

  /**
   * サジェスト結果へのフィードバックを保存する
   */
  saveSuggestFeedback(noteId: number, query: string, isUseful: boolean, context?: string): number {
    const now = new Date().toISOString();
    const info = this.stmt(
      `
      INSERT INTO suggest_feedback (note_id, query, is_useful, context, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(noteId, query, isUseful ? 1 : 0, context ?? null, now);
    return Number(info.lastInsertRowid);
  }

  /**
   * 特定ノートのサジェストフィードバック一覧を取得する（新しい順）
   */
  getSuggestFeedbackForNote(noteId: number): Array<{
    id: number;
    query: string;
    isUseful: boolean;
    context: string | null;
    createdAt: string;
  }> {
    const rows = this.stmt(
      `
      SELECT id, query, is_useful as isUseful, context, created_at as createdAt
      FROM suggest_feedback
      WHERE note_id = ?
      ORDER BY id DESC
    `,
    ).all(noteId) as Array<{
      id: number;
      query: string;
      isUseful: number;
      context: string | null;
      createdAt: string;
    }>;
    return rows.map((row) => ({ ...row, isUseful: row.isUseful === 1 }));
  }

  /**
   * ノートを deprecated にマークする
   */
  deprecateNote(noteId: number, reason: string): void {
    const note = this.getNoteById(noteId);
    if (!note) throw new KnowledgeNotFoundError(noteId, "id");

    this.stmt("UPDATE knowledge_notes SET deprecated = 1, deprecation_reason = ? WHERE id = ?").run(
      reason,
      noteId,
    );
  }

  /**
   * ノートの deprecated フラグを解除する
   */
  undeprecateNote(noteId: number): void {
    const note = this.getNoteById(noteId);
    if (!note) throw new KnowledgeNotFoundError(noteId, "id");

    this.stmt(
      "UPDATE knowledge_notes SET deprecated = 0, deprecation_reason = NULL WHERE id = ?",
    ).run(noteId);
  }

  /**
   * 既存ノートの新バージョンを作成する
   * 旧ノートは deprecated にマークされ、新ノートが supersedes で旧ノートを参照する
   */
  createNewVersion(noteId: number, data: Partial<KnowledgeData>): number {
    const existing = this.getNoteById(noteId);
    if (!existing) throw new KnowledgeNotFoundError(noteId, "id");

    const now = new Date().toISOString();
    const currentVersion = existing.version ?? 1;
    const newVersion = currentVersion + 1;

    const title = data.title ?? existing.title;
    const content = data.content ?? existing.content;
    const frontmatterJson = data.frontmatter
      ? JSON.stringify(data.frontmatter)
      : existing.frontmatter_json;
    const contentHash = this.computeHash(content);

    // file_path に UNIQUE 制約があるため、バージョン付きパスを生成
    const versionedPath = `${existing.file_path}#v${newVersion}`;

    const createNewVersion = this.db.transaction(() => {
      // deprecated にマーク
      this.stmt(
        "UPDATE knowledge_notes SET deprecated = 1, deprecation_reason = ? WHERE id = ?",
      ).run(`Superseded by version ${newVersion}`, noteId);

      // 新バージョンを INSERT
      const info = this.stmt(
        `
        INSERT INTO knowledge_notes (
          file_path, title, content, frontmatter_json,
          created_at, updated_at, content_hash,
          version, supersedes, valid_from, deprecated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `,
      ).run(
        versionedPath,
        title,
        content,
        frontmatterJson,
        existing.created_at,
        now,
        contentHash,
        newVersion,
        noteId,
        now,
      );
      return Number(info.lastInsertRowid);
    });

    return createNewVersion();
  }

  /**
   * 指定IDリストのノートをサマリー形式（content, frontmatter_jsonを除く）で一括取得する
   * SQLITE_MAX_VARIABLE_NUMBER 対策として 500件ずつチャンク処理する
   *
   * **注意**: 返り順は入力 ids の順序と一致しない。順序が重要な場合は
   * 呼び出し元で id→note の Map を構築してマッピングすること。
   */
  getNotesSummaryByIds(ids: number[]): KnowledgeNoteSummary[] {
    if (ids.length === 0) return [];
    const CHUNK = 500;
    const results: KnowledgeNoteSummary[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => "?").join(",");
      const stmt = this.db.prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM knowledge_notes WHERE id IN (${placeholders})`,
      );
      results.push(...(stmt.all(...chunk) as KnowledgeNoteSummary[]));
    }
    return results;
  }

  /**
   * 指定IDリストのノートを全カラムで一括取得する
   * SQLITE_MAX_VARIABLE_NUMBER 対策として 500件ずつチャンク処理する
   *
   * **注意**: 返り順は入力 ids の順序と一致しない。順序が重要な場合は
   * 呼び出し元で id→note の Map を構築してマッピングすること。
   */
  getNotesByIds(ids: number[]): KnowledgeNote[] {
    if (ids.length === 0) return [];
    const CHUNK = 500;
    const results: KnowledgeNote[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => "?").join(",");
      const stmt = this.db.prepare(`SELECT * FROM knowledge_notes WHERE id IN (${placeholders})`);
      results.push(...(stmt.all(...chunk) as KnowledgeNote[]));
    }
    return results;
  }

  /**
   * 現在 note_embeddings テーブルに存在するモデル名を取得する。
   * 混合モデル検出に使用する。
   */
  getExistingEmbeddingModelNames(): string[] {
    const rows = this.stmt(
      "SELECT DISTINCT model_name FROM note_embeddings WHERE model_name IS NOT NULL",
    )
      .pluck()
      .all() as string[];
    return rows;
  }

  /**
   * 既存の埋め込みが指定モデル名と一致するか検証する。
   * 異なるモデルの埋め込みが混在する場合は consistent: false を返す。
   */
  checkEmbeddingModelConsistency(currentModelName: string): {
    consistent: boolean;
    existingModels: string[];
  } {
    const existingModels = this.getExistingEmbeddingModelNames();
    if (existingModels.length === 0) {
      return { consistent: true, existingModels: [] };
    }
    const consistent = existingModels.every((m) => m === currentModelName);
    return { consistent, existingModels };
  }

  /**
   * すべての埋め込みを削除する（reindex 用）
   */
  deleteAllEmbeddings(): number {
    const info = this.db.prepare("DELETE FROM note_embeddings").run();
    // vec0 テーブルも削除（存在する場合）
    try {
      this.db.prepare("DELETE FROM note_embeddings_vec").run();
    } catch {
      // vec0 テーブルが存在しない場合は無視
    }
    return info.changes;
  }

  close(): void {
    this._stmtCache.clear();
    this.db.close();
  }
}
