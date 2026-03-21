import type { Migration } from "../migrator.js";

const BITEMPORAL_SQL = `
-- relations テーブルに bi-temporal カラム追加
ALTER TABLE relations ADD COLUMN valid_from TEXT;
ALTER TABLE relations ADD COLUMN valid_to TEXT;
ALTER TABLE relations ADD COLUMN recorded_at TEXT;
ALTER TABLE relations ADD COLUMN superseded_at TEXT;

-- 既存行のデフォルト設定（created_at をコピー）
UPDATE relations SET valid_from = created_at, recorded_at = created_at WHERE valid_from IS NULL;

-- observations テーブルに bi-temporal カラム追加
ALTER TABLE observations ADD COLUMN valid_from TEXT;
ALTER TABLE observations ADD COLUMN valid_to TEXT;
ALTER TABLE observations ADD COLUMN recorded_at TEXT;
ALTER TABLE observations ADD COLUMN superseded_at TEXT;

-- 既存行のデフォルト設定
UPDATE observations SET valid_from = created_at, recorded_at = created_at WHERE valid_from IS NULL;

-- Active VIEW: 「現在有効」かつ「最新レコード」のみ
CREATE VIEW active_relations AS
  SELECT * FROM relations
  WHERE valid_to IS NULL AND superseded_at IS NULL;

CREATE VIEW active_observations AS
  SELECT * FROM observations
  WHERE valid_to IS NULL AND superseded_at IS NULL;

-- インデックス（VIEW フィルタ高速化用）
CREATE INDEX idx_relations_valid_to ON relations(valid_to);
CREATE INDEX idx_relations_superseded ON relations(superseded_at);
CREATE INDEX idx_observations_valid_to ON observations(valid_to);
CREATE INDEX idx_observations_superseded ON observations(superseded_at);
`;

const BITEMPORAL_DOWN_SQL = `
DROP VIEW IF EXISTS active_observations;
DROP VIEW IF EXISTS active_relations;
DROP INDEX IF EXISTS idx_observations_superseded;
DROP INDEX IF EXISTS idx_observations_valid_to;
DROP INDEX IF EXISTS idx_relations_superseded;
DROP INDEX IF EXISTS idx_relations_valid_to;
`;

export const migration005b: Migration = {
  version: 7,
  name: "bitemporal",
  up: (db) => {
    db.exec(BITEMPORAL_SQL);
  },
  down: (db) => {
    db.exec(BITEMPORAL_DOWN_SQL);
  },
};
