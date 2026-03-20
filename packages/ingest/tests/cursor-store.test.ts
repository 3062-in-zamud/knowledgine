import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { Migrator, ALL_MIGRATIONS } from "@knowledgine/core";
import { CursorStore } from "../src/cursor-store.js";
import type { IngestCursorData } from "../src/types.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  const migrator = new Migrator(db, ALL_MIGRATIONS);
  migrator.migrate();
  return db;
}

describe("CursorStore", () => {
  let db: Database.Database;
  let store: CursorStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CursorStore(db);
  });

  describe("getCursor", () => {
    it("存在しないカーソルはundefinedを返す", () => {
      expect(store.getCursor("plugin-a", "/path/to/source")).toBeUndefined();
    });

    it("保存済みカーソルを取得できる", () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const cursor: IngestCursorData = {
        pluginId: "plugin-a",
        sourcePath: "/path/to/source",
        checkpoint: "abc123",
        lastIngestAt: now,
      };
      store.saveCursor(cursor);

      const result = store.getCursor("plugin-a", "/path/to/source");
      expect(result).toBeDefined();
      expect(result!.pluginId).toBe("plugin-a");
      expect(result!.sourcePath).toBe("/path/to/source");
      expect(result!.checkpoint).toBe("abc123");
      expect(result!.lastIngestAt.toISOString()).toBe(now.toISOString());
    });

    it("lastIngestAtがDate型で返る", () => {
      store.saveCursor({
        pluginId: "plugin-b",
        sourcePath: "/path",
        checkpoint: "cp1",
        lastIngestAt: new Date("2026-06-15T12:00:00.000Z"),
      });
      const result = store.getCursor("plugin-b", "/path");
      expect(result!.lastIngestAt).toBeInstanceOf(Date);
    });
  });

  describe("saveCursor", () => {
    it("新規カーソルを保存できる", () => {
      store.saveCursor({
        pluginId: "plugin-a",
        sourcePath: "/src",
        checkpoint: "v1",
        lastIngestAt: new Date(),
      });
      expect(store.getCursor("plugin-a", "/src")).toBeDefined();
    });

    it("既存カーソルをupsertで更新できる", () => {
      const cursor: IngestCursorData = {
        pluginId: "plugin-a",
        sourcePath: "/src",
        checkpoint: "v1",
        lastIngestAt: new Date("2026-01-01T00:00:00.000Z"),
      };
      store.saveCursor(cursor);

      const updated: IngestCursorData = {
        ...cursor,
        checkpoint: "v2",
        lastIngestAt: new Date("2026-02-01T00:00:00.000Z"),
      };
      store.saveCursor(updated);

      const result = store.getCursor("plugin-a", "/src");
      expect(result!.checkpoint).toBe("v2");
      expect(result!.lastIngestAt.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    });
  });

  describe("deleteCursor", () => {
    it("存在するカーソルを削除できる", () => {
      store.saveCursor({
        pluginId: "plugin-a",
        sourcePath: "/src",
        checkpoint: "v1",
        lastIngestAt: new Date(),
      });
      const result = store.deleteCursor("plugin-a", "/src");
      expect(result).toBe(true);
      expect(store.getCursor("plugin-a", "/src")).toBeUndefined();
    });

    it("存在しないカーソルの削除はfalseを返す", () => {
      expect(store.deleteCursor("nonexistent", "/path")).toBe(false);
    });
  });

  describe("listCursors", () => {
    it("空の場合は空配列を返す", () => {
      expect(store.listCursors()).toEqual([]);
    });

    it("複数のカーソルを一覧取得できる", () => {
      store.saveCursor({ pluginId: "a", sourcePath: "/p1", checkpoint: "c1", lastIngestAt: new Date("2026-01-01T00:00:00.000Z") });
      store.saveCursor({ pluginId: "b", sourcePath: "/p2", checkpoint: "c2", lastIngestAt: new Date("2026-01-02T00:00:00.000Z") });

      const cursors = store.listCursors();
      expect(cursors).toHaveLength(2);
      const ids = cursors.map((c) => c.pluginId).sort();
      expect(ids).toEqual(["a", "b"]);
    });

    it("全カーソルのlastIngestAtがDate型", () => {
      store.saveCursor({ pluginId: "x", sourcePath: "/path", checkpoint: "cp", lastIngestAt: new Date() });
      const cursors = store.listCursors();
      for (const c of cursors) {
        expect(c.lastIngestAt).toBeInstanceOf(Date);
      }
    });
  });
});
