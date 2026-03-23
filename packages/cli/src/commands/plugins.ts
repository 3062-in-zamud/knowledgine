import { resolve } from "path";
import { mkdirSync } from "fs";
import { defineConfig, resolveDefaultPath, createDatabase, Migrator, ALL_MIGRATIONS } from "@knowledgine/core";
import { CursorStore } from "@knowledgine/ingest";
import { createDefaultRegistry } from "../lib/plugin-loader.js";
import { createTable } from "../lib/ui/index.js";

export async function pluginsListCommand(): Promise<void> {
  const registry = createDefaultRegistry();
  const plugins = registry.list();

  const rows = plugins.map((plugin) => {
    const { id, name, version, priority } = plugin.manifest;
    return [id, name, version, String(priority)];
  });

  console.error(createTable({ head: ["ID", "Name", "Version", "Priority"], rows }));
}

export interface PluginsStatusOptions {
  path?: string;
}

export async function pluginsStatusCommand(options: PluginsStatusOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);

  const knowledgineDir = resolve(rootPath, ".knowledgine");
  mkdirSync(knowledgineDir, { recursive: true });
  const config = defineConfig({ rootPath });
  const db = createDatabase(config.dbPath, { enableVec: true });
  new Migrator(db, ALL_MIGRATIONS).migrate();

  const cursorStore = new CursorStore(db);
  const cursors = cursorStore.listCursors();
  const cursorMap = new Map(cursors.map((c) => [c.pluginId, c]));

  const registry = createDefaultRegistry();
  const plugins = registry.list();

  const rows = plugins.map((plugin) => {
    const cursor = cursorMap.get(plugin.manifest.id);
    const lastIngest = cursor
      ? cursor.lastIngestAt.toISOString().replace("T", " ").slice(0, 19)
      : "never";
    const checkpoint = cursor
      ? cursor.checkpoint.slice(0, 20) + (cursor.checkpoint.length > 20 ? "..." : "")
      : "-";
    return [plugin.manifest.id, lastIngest, checkpoint];
  });

  console.error(createTable({ head: ["Plugin", "Last Ingest", "Checkpoint"], rows }));

  db.close();
}
