import { statSync } from "fs";
import type Database from "better-sqlite3";
import type { StorageCategory } from "./storage-categories.js";
import { STORAGE_CATEGORIES, classifyTable } from "./storage-categories.js";

export interface StorageBreakdown {
  totalBytes: number;
  pageSize: number;
  freelistBytes: number;
  walBytes: number;
  byCategory: Record<StorageCategory, number>;
  fallback?: "page-count-only";
}

function emptyByCategory(): Record<StorageCategory, number> {
  const out = {} as Record<StorageCategory, number>;
  for (const cat of STORAGE_CATEGORIES) out[cat] = 0;
  return out;
}

function readWalBytes(db: Database.Database): number {
  // better-sqlite3 exposes the on-disk path via `.name`. ":memory:" and
  // unnamed/temporary databases do not produce a -wal sidecar file.
  const name = db.name;
  if (!name || name === "" || name === ":memory:") return 0;
  try {
    return statSync(`${name}-wal`).size;
  } catch {
    return 0;
  }
}

/**
 * Compute a per-category storage breakdown of an open SQLite database.
 *
 * Uses the `dbstat` virtual table (default-on in the better-sqlite3 v11
 * amalgamation) to attribute payload+unused bytes per table. Falls back to
 * `PRAGMA page_count * page_size` when `dbstat` is unavailable; the
 * returned object then carries `fallback: 'page-count-only'` and all
 * category buckets are zero.
 */
export function computeStorageBreakdown(db: Database.Database): StorageBreakdown {
  const pageSizeRow = db.prepare("PRAGMA page_size").get() as { page_size: number };
  const pageSize = pageSizeRow.page_size;
  const pageCountRow = db.prepare("PRAGMA page_count").get() as { page_count: number };
  const pageCount = pageCountRow.page_count;
  const totalBytes = pageCount * pageSize;
  const freelistRow = db.prepare("PRAGMA freelist_count").get() as { freelist_count: number };
  const freelistBytes = freelistRow.freelist_count * pageSize;
  const walBytes = readWalBytes(db);

  const byCategory = emptyByCategory();

  let rows: Array<{ name: string; payload: number; unused: number }>;
  try {
    rows = db
      .prepare(
        "SELECT name, SUM(payload) AS payload, SUM(unused) AS unused FROM dbstat GROUP BY name",
      )
      .all() as Array<{ name: string; payload: number; unused: number }>;
  } catch {
    return {
      totalBytes,
      pageSize,
      freelistBytes,
      walBytes,
      byCategory,
      fallback: "page-count-only",
    };
  }

  for (const row of rows) {
    const cat = classifyTable(row.name);
    byCategory[cat] += (row.payload ?? 0) + (row.unused ?? 0);
  }

  return { totalBytes, pageSize, freelistBytes, walBytes, byCategory };
}
