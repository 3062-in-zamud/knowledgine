import type Database from "better-sqlite3";
import type {
  Entity,
  Relation,
  Observation,
  EntityType,
  RelationType,
  ObservationType,
  EntityWithGraph,
} from "../types.js";
import { DatabaseError, ValidationError } from "../errors.js";

interface EntityRow {
  id: number;
  name: string;
  entity_type: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
  metadata_json: string | null;
}

interface RelationRow {
  id: number;
  from_entity_id: number;
  to_entity_id: number;
  relation_type: string;
  strength: number;
  description: string | null;
  created_at: string;
  valid_at: string | null;
  invalid_at: string | null;
  recorded_at: string | null;
  superseded_by: string | null;
}

interface ObservationRow {
  id: number;
  entity_id: number;
  content: string;
  observation_type: string;
  confidence: number | null;
  source_note_id: number | null;
  source_pattern_id: number | null;
  created_at: string;
  metadata_json: string | null;
  valid_at: string | null;
  invalid_at: string | null;
  recorded_at: string | null;
  superseded_by: string | null;
}

function rowToEntity(row: EntityRow): Entity & { id: number } {
  return {
    id: row.id,
    name: row.name,
    entityType: row.entity_type as EntityType,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : undefined,
  };
}

function rowToRelation(row: RelationRow): Relation & { id: number } {
  return {
    id: row.id,
    fromEntityId: row.from_entity_id,
    toEntityId: row.to_entity_id,
    relationType: row.relation_type as RelationType,
    strength: row.strength,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToObservation(row: ObservationRow): Observation & { id: number } {
  return {
    id: row.id,
    entityId: row.entity_id,
    content: row.content,
    observationType: row.observation_type as ObservationType,
    confidence: row.confidence ?? undefined,
    sourceNoteId: row.source_note_id ?? undefined,
    sourcePatternId: row.source_pattern_id ?? undefined,
    createdAt: row.created_at,
    metadata: row.metadata_json
      ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
      : undefined,
  };
}

export class GraphRepository {
  constructor(private db: Database.Database) {}

  // ── Entity CRUD ──────────────────────────────────────────────

  createEntity(entity: Omit<Entity, "id">): number {
    if (!entity.name || entity.name.trim() === "") {
      throw new ValidationError("name", entity.name, "Entity name is required");
    }
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO entities (name, entity_type, description, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        entity.name.toLowerCase(),
        entity.entityType,
        entity.description ?? null,
        entity.createdAt || now,
        entity.updatedAt ?? null,
        entity.metadata ? JSON.stringify(entity.metadata) : null,
      );
      return Number(info.lastInsertRowid);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError("createEntity", error, { name: entity.name });
    }
  }

  /**
   * 名前を小文字正規化してupsert。同名・同タイプのエンティティは更新する。
   */
  upsertEntity(entity: Omit<Entity, "id">): number {
    if (!entity.name || entity.name.trim() === "") {
      throw new ValidationError("name", entity.name, "Entity name is required");
    }
    try {
      const normalizedName = entity.name.toLowerCase();
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO entities (name, entity_type, description, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(name, entity_type) DO UPDATE SET
          description = COALESCE(excluded.description, description),
          updated_at = excluded.updated_at,
          metadata_json = COALESCE(excluded.metadata_json, metadata_json)
      `);
      stmt.run(
        normalizedName,
        entity.entityType,
        entity.description ?? null,
        entity.createdAt || now,
        now,
        entity.metadata ? JSON.stringify(entity.metadata) : null,
      );
      const existing = this.getEntityByName(normalizedName, entity.entityType);
      return existing!.id!;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError("upsertEntity", error, { name: entity.name });
    }
  }

  getEntityById(id: number): (Entity & { id: number }) | undefined {
    const row = this.db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as
      | EntityRow
      | undefined;
    return row ? rowToEntity(row) : undefined;
  }

  getEntityByName(name: string, entityType?: EntityType): (Entity & { id: number }) | undefined {
    const normalizedName = name.toLowerCase();
    if (entityType) {
      const row = this.db
        .prepare("SELECT * FROM entities WHERE name = ? AND entity_type = ?")
        .get(normalizedName, entityType) as EntityRow | undefined;
      return row ? rowToEntity(row) : undefined;
    }
    const row = this.db
      .prepare("SELECT * FROM entities WHERE name = ? LIMIT 1")
      .get(normalizedName) as EntityRow | undefined;
    return row ? rowToEntity(row) : undefined;
  }

  /**
   * FTS5 trigram検索。3文字未満はLIKEフォールバック。
   */
  searchEntities(query: string, limit = 20): Array<Entity & { id: number }> {
    if (query.length < 3) {
      // LIKE fallback for short queries
      const rows = this.db
        .prepare(`SELECT * FROM entities WHERE name LIKE ? OR description LIKE ? LIMIT ?`)
        .all(`%${query}%`, `%${query}%`, limit) as EntityRow[];
      return rows.map(rowToEntity);
    }
    try {
      const rows = this.db
        .prepare(
          `
          SELECT e.* FROM entities e
          JOIN entities_fts fts ON e.id = fts.rowid
          WHERE entities_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `,
        )
        .all(query, limit) as EntityRow[];
      return rows.map(rowToEntity);
    } catch {
      // FTS失敗時はLIKEフォールバック
      const rows = this.db
        .prepare(`SELECT * FROM entities WHERE name LIKE ? OR description LIKE ? LIMIT ?`)
        .all(`%${query}%`, `%${query}%`, limit) as EntityRow[];
      return rows.map(rowToEntity);
    }
  }

  deleteEntity(id: number): boolean {
    try {
      const info = this.db.prepare("DELETE FROM entities WHERE id = ?").run(id);
      return info.changes > 0;
    } catch (error) {
      throw new DatabaseError("deleteEntity", error, { id });
    }
  }

  // ── Relation CRUD ─────────────────────────────────────────────

  createRelation(relation: Omit<Relation, "id">): number {
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO relations (from_entity_id, to_entity_id, relation_type, strength, description, created_at, valid_at, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      const info = stmt.run(
        relation.fromEntityId,
        relation.toEntityId,
        relation.relationType,
        relation.strength ?? 1.0,
        relation.description ?? null,
        relation.createdAt || now,
      );
      return Number(info.lastInsertRowid);
    } catch (error) {
      throw new DatabaseError("createRelation", error, {
        fromEntityId: relation.fromEntityId,
        toEntityId: relation.toEntityId,
      });
    }
  }

  /**
   * 同一 (from, to, type) のrelationが存在する場合はstrengthをMAXで更新。
   */
  upsertRelation(relation: Omit<Relation, "id">): number {
    try {
      const now = new Date().toISOString();
      const strength = relation.strength ?? 1.0;
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO relations
          (from_entity_id, to_entity_id, relation_type, strength, description, created_at, valid_at, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      insertStmt.run(
        relation.fromEntityId,
        relation.toEntityId,
        relation.relationType,
        strength,
        relation.description ?? null,
        relation.createdAt || now,
      );
      const updateStmt = this.db.prepare(`
        UPDATE relations
        SET strength = MAX(strength, ?)
        WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?
      `);
      updateStmt.run(strength, relation.fromEntityId, relation.toEntityId, relation.relationType);
      const existing = this.db
        .prepare(
          "SELECT id FROM relations WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?",
        )
        .get(relation.fromEntityId, relation.toEntityId, relation.relationType) as
        | { id: number }
        | undefined;
      return existing?.id ?? 0;
    } catch (error) {
      throw new DatabaseError("upsertRelation", error, {
        fromEntityId: relation.fromEntityId,
        toEntityId: relation.toEntityId,
      });
    }
  }

  getRelationsByEntityId(entityId: number): Array<Relation & { id: number }> {
    const rows = this.db
      .prepare(
        "SELECT * FROM active_relations WHERE from_entity_id = ? OR to_entity_id = ? ORDER BY strength DESC",
      )
      .all(entityId, entityId) as RelationRow[];
    return rows.map(rowToRelation);
  }

  deleteRelation(id: number): boolean {
    try {
      const info = this.db.prepare("DELETE FROM relations WHERE id = ?").run(id);
      return info.changes > 0;
    } catch (error) {
      throw new DatabaseError("deleteRelation", error, { id });
    }
  }

  // ── Observation CRUD ──────────────────────────────────────────

  createObservation(observation: Omit<Observation, "id">): number {
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO observations
          (entity_id, content, observation_type, confidence, source_note_id, source_pattern_id, created_at, metadata_json, valid_at, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      const info = stmt.run(
        observation.entityId,
        observation.content,
        observation.observationType,
        observation.confidence ?? null,
        observation.sourceNoteId ?? null,
        observation.sourcePatternId ?? null,
        observation.createdAt || now,
        observation.metadata ? JSON.stringify(observation.metadata) : null,
      );
      return Number(info.lastInsertRowid);
    } catch (error) {
      throw new DatabaseError("createObservation", error, { entityId: observation.entityId });
    }
  }

  getObservationsByEntityId(entityId: number): Array<Observation & { id: number }> {
    const rows = this.db
      .prepare("SELECT * FROM active_observations WHERE entity_id = ? ORDER BY created_at DESC")
      .all(entityId) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  deleteObservation(id: number): boolean {
    try {
      const info = this.db.prepare("DELETE FROM observations WHERE id = ?").run(id);
      return info.changes > 0;
    } catch (error) {
      throw new DatabaseError("deleteObservation", error, { id });
    }
  }

  // ── Entity-Note Links ─────────────────────────────────────────

  linkEntityToNote(entityId: number, noteId: number): void {
    try {
      this.db
        .prepare("INSERT OR IGNORE INTO entity_note_links (entity_id, note_id) VALUES (?, ?)")
        .run(entityId, noteId);
    } catch (error) {
      throw new DatabaseError("linkEntityToNote", error, { entityId, noteId });
    }
  }

  getLinkedNotes(entityId: number): Array<{ entityId: number; noteId: number }> {
    const rows = this.db
      .prepare("SELECT entity_id, note_id FROM entity_note_links WHERE entity_id = ?")
      .all(entityId) as Array<{ entity_id: number; note_id: number }>;
    return rows.map((r) => ({ entityId: r.entity_id, noteId: r.note_id }));
  }

  getLinkedEntities(noteId: number): Array<Entity & { id: number }> {
    const rows = this.db
      .prepare(
        `
        SELECT e.* FROM entities e
        JOIN entity_note_links l ON e.id = l.entity_id
        WHERE l.note_id = ?
      `,
      )
      .all(noteId) as EntityRow[];
    return rows.map(rowToEntity);
  }

  // ── Graph Traversal ───────────────────────────────────────────

  getEntityWithGraph(entityId: number): EntityWithGraph | undefined {
    const entity = this.getEntityById(entityId);
    if (!entity) return undefined;

    const observations = this.getObservationsByEntityId(entityId);

    const outgoingRows = this.db
      .prepare(
        `
        SELECT r.*, e.id as te_id, e.name as te_name, e.entity_type as te_type,
               e.description as te_desc, e.created_at as te_created, e.updated_at as te_updated, e.metadata_json as te_meta
        FROM active_relations r
        JOIN entities e ON e.id = r.to_entity_id
        WHERE r.from_entity_id = ?
        ORDER BY r.strength DESC
      `,
      )
      .all(entityId) as Array<
      RelationRow & {
        te_id: number;
        te_name: string;
        te_type: string;
        te_desc: string | null;
        te_created: string;
        te_updated: string | null;
        te_meta: string | null;
      }
    >;

    const outgoingRelations = outgoingRows.map((row) => ({
      ...rowToRelation(row),
      targetEntity: rowToEntity({
        id: row.te_id,
        name: row.te_name,
        entity_type: row.te_type,
        description: row.te_desc,
        created_at: row.te_created,
        updated_at: row.te_updated,
        metadata_json: row.te_meta,
      }),
    }));

    const incomingRows = this.db
      .prepare(
        `
        SELECT r.*, e.id as se_id, e.name as se_name, e.entity_type as se_type,
               e.description as se_desc, e.created_at as se_created, e.updated_at as se_updated, e.metadata_json as se_meta
        FROM active_relations r
        JOIN entities e ON e.id = r.from_entity_id
        WHERE r.to_entity_id = ?
        ORDER BY r.strength DESC
      `,
      )
      .all(entityId) as Array<
      RelationRow & {
        se_id: number;
        se_name: string;
        se_type: string;
        se_desc: string | null;
        se_created: string;
        se_updated: string | null;
        se_meta: string | null;
      }
    >;

    const incomingRelations = incomingRows.map((row) => ({
      ...rowToRelation(row),
      sourceEntity: rowToEntity({
        id: row.se_id,
        name: row.se_name,
        entity_type: row.se_type,
        description: row.se_desc,
        created_at: row.se_created,
        updated_at: row.se_updated,
        metadata_json: row.se_meta,
      }),
    }));

    const linkedNoteRows = this.db
      .prepare(
        `
        SELECT l.entity_id, l.note_id, n.file_path, n.title, n.created_at
        FROM entity_note_links l
        JOIN knowledge_notes n ON n.id = l.note_id
        WHERE l.entity_id = ?
      `,
      )
      .all(entityId) as Array<{
      entity_id: number;
      note_id: number;
      file_path: string;
      title: string;
      created_at: string;
    }>;

    const linkedNotes = linkedNoteRows.map((row) => ({
      entityId: row.entity_id,
      noteId: row.note_id,
      note: {
        filePath: row.file_path,
        title: row.title,
        createdAt: row.created_at,
      },
    }));

    return {
      ...entity,
      observations,
      outgoingRelations,
      incomingRelations,
      linkedNotes,
    };
  }

  /**
   * 幅優先探索でhops内の関連エンティティを取得。
   * 循環グラフ対策: visitedセットで重複訪問を防ぐ。maxHops上限は3。
   */
  findRelatedEntities(
    entityId: number,
    maxHops: number = 1,
  ): Array<Entity & { id: number; hops: number }> {
    const safeMaxHops = Math.min(maxHops, 3);
    const visited = new Set<number>([entityId]);
    const result: Array<Entity & { id: number; hops: number }> = [];
    let frontier = [entityId];

    for (let hop = 1; hop <= safeMaxHops; hop++) {
      if (frontier.length === 0) break;
      const placeholders = frontier.map(() => "?").join(",");
      const nextIds: number[] = [];

      const rows = this.db
        .prepare(
          `
          SELECT DISTINCT
            CASE WHEN r.from_entity_id IN (${placeholders}) THEN r.to_entity_id
                 ELSE r.from_entity_id END as neighbor_id
          FROM active_relations r
          WHERE r.from_entity_id IN (${placeholders}) OR r.to_entity_id IN (${placeholders})
        `,
        )
        .all(...frontier, ...frontier, ...frontier) as Array<{ neighbor_id: number }>;

      for (const { neighbor_id } of rows) {
        if (visited.has(neighbor_id)) continue;
        visited.add(neighbor_id);
        nextIds.push(neighbor_id);

        const entity = this.getEntityById(neighbor_id);
        if (entity) {
          result.push({ ...entity, hops: hop });
        }
      }

      frontier = nextIds;
    }

    return result;
  }

  // ── Stats ─────────────────────────────────────────────────────

  getGraphStats(): {
    totalEntities: number;
    totalRelations: number;
    totalObservations: number;
    entitiesByType: Record<string, number>;
    relationsByType: Record<string, number>;
  } {
    const totalEntities = (
      this.db.prepare("SELECT COUNT(*) as count FROM entities").get() as { count: number }
    ).count;
    const totalRelations = (
      this.db.prepare("SELECT COUNT(*) as count FROM active_relations").get() as { count: number }
    ).count;
    const totalObservations = (
      this.db.prepare("SELECT COUNT(*) as count FROM active_observations").get() as {
        count: number;
      }
    ).count;

    const entityTypeRows = this.db
      .prepare("SELECT entity_type, COUNT(*) as count FROM entities GROUP BY entity_type")
      .all() as Array<{ entity_type: string; count: number }>;
    const entitiesByType: Record<string, number> = {};
    for (const row of entityTypeRows) {
      entitiesByType[row.entity_type] = row.count;
    }

    const relationTypeRows = this.db
      .prepare(
        "SELECT relation_type, COUNT(*) as count FROM active_relations GROUP BY relation_type",
      )
      .all() as Array<{ relation_type: string; count: number }>;
    const relationsByType: Record<string, number> = {};
    for (const row of relationTypeRows) {
      relationsByType[row.relation_type] = row.count;
    }

    return { totalEntities, totalRelations, totalObservations, entitiesByType, relationsByType };
  }

  // ── Bi-temporal Operations ────────────────────────────────────

  invalidateRelation(id: number, invalidAt?: string): boolean {
    try {
      const info = this.db
        .prepare(
          `UPDATE relations SET invalid_at = COALESCE(?, datetime('now')) WHERE id = ? AND invalid_at IS NULL`,
        )
        .run(invalidAt ?? null, id);
      return info.changes > 0;
    } catch (error) {
      throw new DatabaseError("invalidateRelation", error, { id });
    }
  }

  invalidateObservation(id: number, invalidAt?: string): boolean {
    try {
      const info = this.db
        .prepare(
          `UPDATE observations SET invalid_at = COALESCE(?, datetime('now')) WHERE id = ? AND invalid_at IS NULL`,
        )
        .run(invalidAt ?? null, id);
      return info.changes > 0;
    } catch (error) {
      throw new DatabaseError("invalidateObservation", error, { id });
    }
  }

  getRelationHistory(
    fromEntityId: number,
    toEntityId: number,
  ): Array<
    Relation & {
      id: number;
      validAt: string | null;
      invalidAt: string | null;
      recordedAt: string | null;
      supersededBy: string | null;
    }
  > {
    const rows = this.db
      .prepare(
        `SELECT * FROM relations WHERE from_entity_id = ? AND to_entity_id = ? ORDER BY recorded_at DESC`,
      )
      .all(fromEntityId, toEntityId) as RelationRow[];
    return rows.map((row) => ({
      ...rowToRelation(row),
      validAt: row.valid_at,
      invalidAt: row.invalid_at,
      recordedAt: row.recorded_at,
      supersededBy: row.superseded_by,
    }));
  }

  /**
   * 指定時点で有効なrelationを取得する。
   * valid_at <= asOf かつ invalid_at > asOf (または invalid_at IS NULL) の条件で絞り込む。
   */
  getRelationsAsOf(entityId: number, asOf: string): Array<Relation & { id: number }> {
    const rows = this.db
      .prepare(
        `SELECT * FROM relations
         WHERE (from_entity_id = ? OR to_entity_id = ?)
           AND (valid_at IS NULL OR valid_at <= ?)
           AND (invalid_at IS NULL OR invalid_at > ?)
         ORDER BY strength DESC`,
      )
      .all(entityId, entityId, asOf, asOf) as RelationRow[];
    return rows.map(rowToRelation);
  }

  /**
   * 指定時点で有効なobservationを取得する。
   * valid_at <= asOf かつ invalid_at > asOf (または invalid_at IS NULL) の条件で絞り込む。
   */
  getObservationsAsOf(entityId: number, asOf: string): Array<Observation & { id: number }> {
    const rows = this.db
      .prepare(
        `SELECT * FROM observations
         WHERE entity_id = ?
           AND (valid_at IS NULL OR valid_at <= ?)
           AND (invalid_at IS NULL OR invalid_at > ?)
         ORDER BY created_at DESC`,
      )
      .all(entityId, asOf, asOf) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  /**
   * エンティティに関連する全observation（invalidated含む）を取得する。
   * タイムライン取得に使用する。
   */
  getAllObservationsForEntity(
    entityId: number,
  ): Array<Observation & { id: number; validAt: string | null; invalidAt: string | null }> {
    const rows = this.db
      .prepare(`SELECT * FROM observations WHERE entity_id = ? ORDER BY created_at ASC`)
      .all(entityId) as ObservationRow[];
    return rows.map((row) => ({
      ...rowToObservation(row),
      validAt: row.valid_at,
      invalidAt: row.invalid_at,
    }));
  }

  /**
   * エンティティに関連する全relation（invalidated含む）を取得する。
   * タイムライン取得に使用する。
   */
  getAllRelationsForEntity(
    entityId: number,
  ): Array<Relation & { id: number; validAt: string | null; invalidAt: string | null }> {
    const rows = this.db
      .prepare(
        `SELECT * FROM relations WHERE from_entity_id = ? OR to_entity_id = ? ORDER BY created_at ASC`,
      )
      .all(entityId, entityId) as RelationRow[];
    return rows.map((row) => ({
      ...rowToRelation(row),
      validAt: row.valid_at,
      invalidAt: row.invalid_at,
    }));
  }
}
