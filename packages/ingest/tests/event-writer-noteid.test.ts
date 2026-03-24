/**
 * EventWriter の戻り値拡張テスト（Phase 0）
 * - writeEvent: { id, noteId } を返す
 * - writeBatch: { processed, errors, noteIds } を返す
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { EventWriter } from "../src/event-writer.js";
import type { NormalizedEvent } from "../src/types.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const migrator = new Migrator(db, ALL_MIGRATIONS);
  migrator.migrate();
  return db;
}

function createMockEvent(index: number): NormalizedEvent {
  return {
    sourceUri: `capture://test/event/${index}`,
    eventType: "capture",
    title: `Test Event ${index}`,
    content: `Content for event ${index}`,
    timestamp: new Date(`2026-01-01T00:00:${String(index % 60).padStart(2, "0")}Z`),
    metadata: { sourcePlugin: "capture", sourceId: `evt-${index}` },
  };
}

describe("EventWriter: Phase 0 戻り値拡張", () => {
  let db: Database.Database;
  let repository: KnowledgeRepository;
  let writer: EventWriter;

  beforeEach(() => {
    db = createTestDb();
    repository = new KnowledgeRepository(db);
    writer = new EventWriter(db, repository);
  });

  describe("writeEvent: noteId を含む戻り値", () => {
    it("writeEvent は { id, noteId } を返す", () => {
      const event = createMockEvent(0);
      const result = writer.writeEvent(event);

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("noteId");
      expect(result.id).toBeGreaterThan(0);
      expect(result.noteId).toBeGreaterThan(0);
    });

    it("noteId は knowledge_notes テーブルの実際の id と一致する", () => {
      const event = createMockEvent(0);
      const result = writer.writeEvent(event);

      const note = db.prepare("SELECT id FROM knowledge_notes ORDER BY id DESC LIMIT 1").get() as {
        id: number;
      };
      expect(result.noteId).toBe(note.id);
    });

    it("複数回呼ぶと noteId は単調増加する", () => {
      const result1 = writer.writeEvent(createMockEvent(0));
      const result2 = writer.writeEvent(createMockEvent(1));

      expect(result2.noteId).toBeGreaterThan(result1.noteId);
    });

    it("既存テストの後方互換: id フィールドは引き続き存在する", () => {
      const result = writer.writeEvent(createMockEvent(0));
      expect(result.id).toBeGreaterThan(0);
    });
  });

  describe("writeBatch: noteIds を含む戻り値", () => {
    it("writeBatch は { processed, errors, noteIds } を返す", () => {
      const events = [createMockEvent(0), createMockEvent(1), createMockEvent(2)];
      const result = writer.writeBatch(events);

      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("errors");
      expect(result).toHaveProperty("noteIds");
    });

    it("noteIds の長さは processed と一致する", () => {
      const events = [createMockEvent(0), createMockEvent(1), createMockEvent(2)];
      const result = writer.writeBatch(events);

      expect(result.noteIds).toHaveLength(result.processed);
    });

    it("全件成功時は noteIds に全 note の id が含まれる", () => {
      const events = [createMockEvent(0), createMockEvent(1)];
      const result = writer.writeBatch(events);

      expect(result.processed).toBe(2);
      expect(result.noteIds).toHaveLength(2);
      result.noteIds.forEach((id) => {
        expect(id).toBeGreaterThan(0);
      });
    });

    it("noteIds の値は knowledge_notes テーブルの実際の id と一致する", () => {
      const events = [createMockEvent(0), createMockEvent(1)];
      const result = writer.writeBatch(events);

      const noteIds = (
        db.prepare("SELECT id FROM knowledge_notes ORDER BY id").all() as Array<{ id: number }>
      ).map((r) => r.id);

      expect(result.noteIds.sort((a, b) => a - b)).toEqual(noteIds.sort((a, b) => a - b));
    });

    it("空配列の場合は noteIds が空配列を返す", () => {
      const result = writer.writeBatch([]);
      expect(result.noteIds).toEqual([]);
    });

    it("一部失敗時: 失敗したイベントの noteId は noteIds に含まれない", () => {
      const events = [createMockEvent(0), createMockEvent(1), createMockEvent(2)];

      const originalSaveNote = repository.saveNote.bind(repository);
      let callCount = 0;
      vi.spyOn(repository, "saveNote").mockImplementation((data) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Simulated failure");
        }
        return originalSaveNote(data);
      });

      const result = writer.writeBatch(events);

      expect(result.errors).toBe(1);
      expect(result.processed).toBe(2);
      expect(result.noteIds).toHaveLength(2);
    });

    it("既存テストの後方互換: processed/errors フィールドは引き続き存在する", () => {
      const events = [createMockEvent(0)];
      const result = writer.writeBatch(events);
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);
    });
  });
});
