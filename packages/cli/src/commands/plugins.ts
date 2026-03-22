import { resolve } from "path";
import { mkdirSync } from "fs";
import { defineConfig, createDatabase, Migrator, ALL_MIGRATIONS } from "@knowledgine/core";
import { CursorStore } from "@knowledgine/ingest";
import { createDefaultRegistry } from "../lib/plugin-loader.js";

export async function pluginsListCommand(): Promise<void> {
  const registry = createDefaultRegistry();
  const plugins = registry.list();

  const header = `${"ID".padEnd(20)}${"Name".padEnd(25)}${"Version".padEnd(10)}Priority`;
  console.error(header);

  for (const plugin of plugins) {
    const { id, name, version, priority } = plugin.manifest;
    console.error(`${id.padEnd(20)}${name.padEnd(25)}${version.padEnd(10)}${priority}`);
  }
}

export interface PluginsStatusOptions {
  path?: string;
}

export async function pluginsStatusCommand(options: PluginsStatusOptions): Promise<void> {
  const rootPath = resolve(options.path ?? process.cwd());

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

  const header = `${"Plugin".padEnd(20)}${"Last Ingest".padEnd(25)}Checkpoint`;
  console.error(header);

  for (const plugin of plugins) {
    const cursor = cursorMap.get(plugin.manifest.id);
    const lastIngest = cursor
      ? cursor.lastIngestAt.toISOString().replace("T", " ").slice(0, 19)
      : "never";
    const checkpoint = cursor
      ? cursor.checkpoint.slice(0, 20) + (cursor.checkpoint.length > 20 ? "..." : "")
      : "-";
    console.error(`${plugin.manifest.id.padEnd(20)}${lastIngest.padEnd(25)}${checkpoint}`);
  }

  db.close();
}
