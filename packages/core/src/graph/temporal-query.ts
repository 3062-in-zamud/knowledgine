import type { GraphRepository } from "./graph-repository.js";
import type { KnowledgeRepository, KnowledgeNote } from "../storage/knowledge-repository.js";
import type { Entity, Relation, Observation } from "../types.js";

export interface PointInTimeQuery {
  entityId?: number;
  entityName?: string;
  asOf: string; // ISO 8601
  includeHistory?: boolean;
}

export interface TemporalQueryResult {
  entity: Entity & { id: number };
  observations: Array<Observation & { id: number }>;
  relations: Array<Relation & { id: number }>;
  noteVersions: KnowledgeNote[];
}

export interface TemporalTimelineEntry {
  timestamp: string;
  type: "observation" | "relation" | "note_version";
  content: string;
  validAt: string | null;
  invalidAt: string | null;
}

/**
 * Temporal Query Engine
 *
 * bi-temporal属性（valid_at, invalid_at）を活用した
 * Point-in-Time QueryとEntity Timeline機能を提供する。
 */
export class TemporalQueryEngine {
  constructor(
    private graphRepository: GraphRepository,
    private repository: KnowledgeRepository,
  ) {}

  /**
   * 指定時点のエンティティ状態を復元する。
   *
   * entityIdまたはentityNameでエンティティを特定し、
   * 指定時点（asOf）で有効だったrelation/observation/noteを返す。
   */
  queryAsOf(query: PointInTimeQuery): TemporalQueryResult | undefined {
    // エンティティを取得
    let entity: (Entity & { id: number }) | undefined;

    if (query.entityId !== undefined) {
      entity = this.graphRepository.getEntityById(query.entityId);
    } else if (query.entityName !== undefined) {
      entity = this.graphRepository.getEntityByName(query.entityName);
    }

    if (!entity) {
      return undefined;
    }

    const entityId = entity.id;

    // 指定時点で有効なrelationを取得
    const relations = this.graphRepository.getRelationsAsOf(entityId, query.asOf);

    // 指定時点で有効なobservationを取得
    const observations = this.graphRepository.getObservationsAsOf(entityId, query.asOf);

    // エンティティに紐づくノートを取得
    const linkedNoteLinks = this.graphRepository.getLinkedNotes(entityId);
    const noteIds = linkedNoteLinks.map((link) => link.noteId);

    // ノートのバージョンを取得
    const noteVersions = this.fetchNoteVersions(noteIds, query.asOf, query.includeHistory ?? false);

    return {
      entity,
      observations,
      relations,
      noteVersions,
    };
  }

  /**
   * エンティティの時系列変遷を取得する。
   *
   * invalidatedされたrelation/observationも含む全履歴を
   * 時系列順（昇順）で返す。
   */
  getEntityTimeline(entityId: number): TemporalTimelineEntry[] {
    const entity = this.graphRepository.getEntityById(entityId);
    if (!entity) {
      return [];
    }

    const entries: TemporalTimelineEntry[] = [];

    // 全observation（invalidated含む）を取得
    const allObservations = this.graphRepository.getAllObservationsForEntity(entityId);
    for (const obs of allObservations) {
      entries.push({
        timestamp: obs.validAt ?? obs.createdAt,
        type: "observation",
        content: obs.content,
        validAt: obs.validAt,
        invalidAt: obs.invalidAt,
      });
    }

    // 全relation（invalidated含む）を取得
    const allRelations = this.graphRepository.getAllRelationsForEntity(entityId);
    for (const rel of allRelations) {
      entries.push({
        timestamp: rel.validAt ?? rel.createdAt,
        type: "relation",
        content: `${rel.relationType} (entity ${rel.fromEntityId} → ${rel.toEntityId})`,
        validAt: rel.validAt,
        invalidAt: rel.invalidAt,
      });
    }

    // タイムスタンプ昇順でソート
    entries.sort((a, b) => {
      if (a.timestamp < b.timestamp) return -1;
      if (a.timestamp > b.timestamp) return 1;
      return 0;
    });

    return entries;
  }

  /**
   * ノートのバージョン履歴チェーンを辿る。
   *
   * 指定noteIdから、supersedes フィールドを辿って古いバージョンを遡り、
   * 逆方向（新しいバージョン）も検索して全バージョンをバージョン番号順で返す。
   */
  getVersionChain(noteId: number): KnowledgeNote[] {
    const startNote = this.repository.getNoteById(noteId);
    if (!startNote) {
      return [];
    }

    const visitedIds = new Set<number>();
    const chain: KnowledgeNote[] = [];

    // 過去方向へ遡る（supersedesチェーン）
    let current: KnowledgeNote | undefined = startNote;
    while (current && !visitedIds.has(current.id)) {
      visitedIds.add(current.id);
      chain.push(current);

      if (current.supersedes !== null && current.supersedes !== undefined) {
        current = this.repository.getNoteById(current.supersedes);
      } else {
        break;
      }
    }

    // 未来方向へ辿る（自分を supersedes している新しいバージョンを検索）
    this.traverseForwardVersions(startNote.id, visitedIds, chain);

    // バージョン番号でソート（nullは0扱い）
    chain.sort((a, b) => {
      const vA = a.version ?? 0;
      const vB = b.version ?? 0;
      return vA - vB;
    });

    return chain;
  }

  // ── プライベートヘルパー ──────────────────────────────────────────────

  /**
   * ノートIDリストからバージョン条件に合うノートを取得する。
   */
  private fetchNoteVersions(
    noteIds: number[],
    asOf: string,
    includeHistory: boolean,
  ): KnowledgeNote[] {
    if (noteIds.length === 0) {
      return [];
    }

    const notes: KnowledgeNote[] = [];

    for (const noteId of noteIds) {
      const note = this.repository.getNoteById(noteId);
      if (!note) continue;

      // valid_from チェック（valid_fromがnullまたはasOf以前のもの）
      if (note.valid_from !== null && note.valid_from > asOf) {
        continue;
      }

      // includeHistory=falseの場合はdeprecatedを除外
      if (!includeHistory && note.deprecated === 1) {
        continue;
      }

      notes.push(note);
    }

    return notes;
  }

  /**
   * 未来方向のバージョンを再帰的に辿る（新しいバージョンを検索）。
   */
  private traverseForwardVersions(
    noteId: number,
    visitedIds: Set<number>,
    chain: KnowledgeNote[],
  ): void {
    // このノートをsupersedesしている新しいバージョンを検索
    // KnowledgeRepositoryにはgetNotesBySupersedes的なAPIがないため、
    // getAllNotesを使って線形探索する（データ量が少ない前提）
    const allNotes = this.repository.getAllNotes();
    const newerVersions = allNotes.filter((n) => n.supersedes === noteId);

    for (const newer of newerVersions) {
      if (!visitedIds.has(newer.id)) {
        visitedIds.add(newer.id);
        chain.push(newer);
        // さらに新しいバージョンを再帰的に辿る
        this.traverseForwardVersions(newer.id, visitedIds, chain);
      }
    }
  }
}
