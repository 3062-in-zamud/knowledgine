import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

export interface MigrationStatus {
  version: number;
  name: string;
  applied: boolean;
  appliedAt?: string;
}

export class Migrator {
  constructor(
    private db: Database.Database,
    private migrations: Migration[],
  ) {
    this.ensureSchemaVersionTable();
  }

  private ensureSchemaVersionTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  }

  getCurrentVersion(): number {
    const row = this.db.prepare("SELECT MAX(version) as version FROM schema_version").get() as
      | { version: number | null }
      | undefined;
    return row?.version ?? 0;
  }

  migrate(): void {
    const currentVersion = this.getCurrentVersion();
    const pending = this.migrations
      .filter((m) => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    if (pending.length === 0) return;

    const runMigrations = this.db.transaction(() => {
      for (const migration of pending) {
        migration.up(this.db);
        this.db
          .prepare("INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)")
          .run(migration.version, migration.name, new Date().toISOString());
      }
    });

    runMigrations();
  }

  rollback(toVersion: number): void {
    const currentVersion = this.getCurrentVersion();
    const toRollback = this.migrations
      .filter((m) => m.version > toVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version);

    if (toRollback.length === 0) return;

    const runRollbacks = this.db.transaction(() => {
      for (const migration of toRollback) {
        migration.down(this.db);
        this.db.prepare("DELETE FROM schema_version WHERE version = ?").run(migration.version);
      }
    });

    runRollbacks();
  }

  status(): MigrationStatus[] {
    const applied = new Map<number, string>();
    const rows = this.db.prepare("SELECT version, applied_at FROM schema_version").all() as Array<{
      version: number;
      applied_at: string;
    }>;

    for (const row of rows) {
      applied.set(row.version, row.applied_at);
    }

    return this.migrations.map((m) => ({
      version: m.version,
      name: m.name,
      applied: applied.has(m.version),
      appliedAt: applied.get(m.version),
    }));
  }
}
