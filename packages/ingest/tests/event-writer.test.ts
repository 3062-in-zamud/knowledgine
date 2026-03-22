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

describe("EventWriter", () => {
  let db: Database.Database;
  let repository: KnowledgeRepository;
  let writer: EventWriter;

  beforeEach(() => {
    db = createTestDb();
    repository = new KnowledgeRepository(db);
    writer = new EventWriter(db, repository);
  });

  describe("writeEvent", () => {
    it("単一イベントをeventsテーブルに書き込む", () => {
      const event = createMockEvent(0);
      const result = writer.writeEvent(event);

      expect(result.id).toBeGreaterThan(0);

      const rows = db.prepare("SELECT count(*) as cnt FROM events").get() as { cnt: number };
      expect(rows.cnt).toBe(1);
    });

    it("単一イベントをnotesテーブルにも書き込む", () => {
      const event = createMockEvent(0);
      writer.writeEvent(event);

      const notes = db.prepare("SELECT count(*) as cnt FROM knowledge_notes").get() as {
        cnt: number;
      };
      expect(notes.cnt).toBe(1);
    });

    it("lastInsertRowidを返す", () => {
      const result1 = writer.writeEvent(createMockEvent(0));
      const result2 = writer.writeEvent(createMockEvent(1));

      expect(result2.id).toBeGreaterThan(result1.id);
    });
  });

  describe("writeBatch", () => {
    it("バッチ書き込みでprocessed/errorsカウントを返す", () => {
      const events = [createMockEvent(0), createMockEvent(1), createMockEvent(2)];
      const result = writer.writeBatch(events);

      expect(result.processed).toBe(3);
      expect(result.errors).toBe(0);
    });

    it("eventsテーブルに全件INSERTされる", () => {
      const events = [createMockEvent(0), createMockEvent(1)];
      writer.writeBatch(events);

      const rows = db.prepare("SELECT count(*) as cnt FROM events").get() as { cnt: number };
      expect(rows.cnt).toBe(2);
    });

    it("notesテーブルにも全件書き込まれる", () => {
      const events = [createMockEvent(0), createMockEvent(1)];
      writer.writeBatch(events);

      const notes = db.prepare("SELECT count(*) as cnt FROM knowledge_notes").get() as {
        cnt: number;
      };
      expect(notes.cnt).toBe(2);
    });

    it("一部イベントが失敗しても他は継続処理される", () => {
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

      expect(result.errors).toBeGreaterThan(0);
      expect(result.processed + result.errors).toBe(3);
    });

    it("空配列の場合はprocessed=0, errors=0", () => {
      const result = writer.writeBatch([]);
      expect(result.processed).toBe(0);
      expect(result.errors).toBe(0);
    });
  });
});
