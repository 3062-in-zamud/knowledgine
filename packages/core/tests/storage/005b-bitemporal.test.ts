import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { Migrator } from "../../src/storage/migrator.js";
import { createDatabase } from "../../src/storage/database.js";
import { migration001 } from "../../src/storage/migrations/001_initial.js";
import { migration002 } from "../../src/storage/migrations/002_memory_layers.js";
import { migration003 } from "../../src/storage/migrations/003_vector_embeddings.js";
import { migration004 } from "../../src/storage/migrations/004_knowledge_graph.js";
import { migration005a } from "../../src/storage/migrations/005a_events_layer.js";
import { migration005b } from "../../src/storage/migrations/005b_bitemporal.js";
import { migration006 } from "../../src/storage/migrations/006_extraction_feedback.js";

const wave2Migrations = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005a,
  migration006,
];

describe("migration005b: bitemporal", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase(":memory:");
    // まず Wave 2 (version 6) まで適用
    new Migrator(db, wave2Migrations).migrate();
  });

  afterEach(() => {
    db.close();
  });

  describe("migration up", () => {
    beforeEach(() => {
      // Wave 3 の 005b を追加適用
      new Migrator(db, [...wave2Migrations, migration005b]).migrate();
    });

    it("should upgrade to version 7", () => {
      const migrator = new Migrator(db, [...wave2Migrations, migration005b]);
      expect(migrator.getCurrentVersion()).toBe(7);
    });

    it("should add bi-temporal columns to relations", () => {
      const cols = db.prepare("PRAGMA table_info(relations)").all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("valid_from");
      expect(colNames).toContain("valid_to");
      expect(colNames).toContain("recorded_at");
      expect(colNames).toContain("superseded_at");
    });

    it("should add bi-temporal columns to observations", () => {
      const cols = db.prepare("PRAGMA table_info(observations)").all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("valid_from");
      expect(colNames).toContain("valid_to");
      expect(colNames).toContain("recorded_at");
      expect(colNames).toContain("superseded_at");
    });

    it("should create active_relations VIEW", () => {
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='view' AND name='active_relations'",
        )
        .get();
      expect(result).toBeDefined();
    });

    it("should create active_observations VIEW", () => {
      const result = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='view' AND name='active_observations'",
        )
        .get();
      expect(result).toBeDefined();
    });

    it("should create indexes on relations", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='relations'")
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_relations_valid_to");
      expect(indexNames).toContain("idx_relations_superseded");
    });

    it("should create indexes on observations", () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='observations'")
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_observations_valid_to");
      expect(indexNames).toContain("idx_observations_superseded");
    });
  });

  describe("existing data migration", () => {
    beforeEach(() => {
      // Wave 2 で既存データを作成
      const now = "2024-01-01T00:00:00.000Z";
      db.prepare(
        `INSERT INTO entities (name, entity_type, created_at) VALUES (?, ?, ?)`,
      ).run("entity-a", "technology", now);
      db.prepare(
        `INSERT INTO entities (name, entity_type, created_at) VALUES (?, ?, ?)`,
      ).run("entity-b", "project", now);
      const a = db.prepare("SELECT id FROM entities WHERE name='entity-a'").get() as { id: number };
      const b = db.prepare("SELECT id FROM entities WHERE name='entity-b'").get() as { id: number };

      db.prepare(
        `INSERT INTO relations (from_entity_id, to_entity_id, relation_type, strength, created_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(a.id, b.id, "uses", 1.0, now);
      db.prepare(
        `INSERT INTO observations (entity_id, content, observation_type, created_at) VALUES (?, ?, ?, ?)`,
      ).run(a.id, "test observation", "fact", now);

      // 005b を適用
      new Migrator(db, [...wave2Migrations, migration005b]).migrate();
    });

    it("should set valid_from = created_at for existing relations", () => {
      const row = db
        .prepare("SELECT valid_from, created_at FROM relations LIMIT 1")
        .get() as { valid_from: string; created_at: string };
      expect(row.valid_from).toBe(row.created_at);
    });

    it("should set recorded_at = created_at for existing relations", () => {
      const row = db
        .prepare("SELECT recorded_at, created_at FROM relations LIMIT 1")
        .get() as { recorded_at: string; created_at: string };
      expect(row.recorded_at).toBe(row.created_at);
    });

    it("should set valid_from = created_at for existing observations", () => {
      const row = db
        .prepare("SELECT valid_from, created_at FROM observations LIMIT 1")
        .get() as { valid_from: string; created_at: string };
      expect(row.valid_from).toBe(row.created_at);
    });

    it("should set recorded_at = created_at for existing observations", () => {
      const row = db
        .prepare("SELECT recorded_at, created_at FROM observations LIMIT 1")
        .get() as { recorded_at: string; created_at: string };
      expect(row.recorded_at).toBe(row.created_at);
    });

    it("should make existing data visible in active_relations VIEW", () => {
      const rows = db.prepare("SELECT * FROM active_relations").all();
      expect(rows.length).toBeGreaterThan(0);
    });

    it("should make existing data visible in active_observations VIEW", () => {
      const rows = db.prepare("SELECT * FROM active_observations").all();
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe("migration down", () => {
    it("should remove VIEWs and indexes on rollback", () => {
      const migrator = new Migrator(db, [...wave2Migrations, migration005b]);
      migrator.migrate();
      expect(migrator.getCurrentVersion()).toBe(7);

      migrator.rollback(6);
      expect(migrator.getCurrentVersion()).toBe(6);

      // VIEWが削除されている
      const activeRelView = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='view' AND name='active_relations'",
        )
        .get();
      expect(activeRelView).toBeUndefined();

      const activeObsView = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='view' AND name='active_observations'",
        )
        .get();
      expect(activeObsView).toBeUndefined();

      // インデックスが削除されている
      const validToIdx = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_relations_valid_to'",
        )
        .get();
      expect(validToIdx).toBeUndefined();
    });
  });
});
