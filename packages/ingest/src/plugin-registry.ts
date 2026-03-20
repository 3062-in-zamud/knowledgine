import type { IngestPlugin } from "./types.js";

export class PluginRegistry {
  private readonly plugins = new Map<string, IngestPlugin>();

  register(plugin: IngestPlugin): void {
    this.plugins.set(plugin.manifest.id, plugin);
  }

  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  get(id: string): IngestPlugin | undefined {
    return this.plugins.get(id);
  }

  getOrThrow(id: string): IngestPlugin {
    const plugin = this.plugins.get(id);
    if (plugin === undefined) {
      throw new Error(`Plugin not found: ${id}`);
    }
    return plugin;
  }

  list(): IngestPlugin[] {
    return Array.from(this.plugins.values());
  }

  listByPriority(): IngestPlugin[] {
    return this.list().sort(
      (a, b) => b.manifest.priority - a.manifest.priority
    );
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  get size(): number {
    return this.plugins.size;
  }

  async disposeAll(): Promise<void> {
    const disposals = Array.from(this.plugins.values()).map((p) => p.dispose());
    await Promise.all(disposals);
    this.plugins.clear();
  }
}
