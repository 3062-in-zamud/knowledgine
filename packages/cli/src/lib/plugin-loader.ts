import {
  PluginRegistry,
  MarkdownPlugin,
  GitHistoryPlugin,
  ClaudeSessionsPlugin,
  GitHubPlugin,
  ObsidianPlugin,
  CursorSessionsPlugin,
  ClineSessionsPlugin,
  CicdPlugin,
} from "@knowledgine/ingest";
import type { PluginConfig, PluginInitResult } from "@knowledgine/ingest";

export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(new MarkdownPlugin());
  registry.register(new GitHistoryPlugin());
  registry.register(new ClaudeSessionsPlugin());
  registry.register(new GitHubPlugin());
  registry.register(new ObsidianPlugin());
  registry.register(new CursorSessionsPlugin());
  registry.register(new ClineSessionsPlugin());
  registry.register(new CicdPlugin());
  return registry;
}

export async function initializePlugins(
  registry: PluginRegistry,
  config?: PluginConfig,
): Promise<Map<string, PluginInitResult>> {
  const results = new Map<string, PluginInitResult>();
  for (const plugin of registry.list()) {
    try {
      const result = await plugin.initialize(config);
      results.set(plugin.manifest.id, result);
    } catch (error) {
      results.set(plugin.manifest.id, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
