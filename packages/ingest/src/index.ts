export type {
  SourceURI,
  PluginPriority,
  PluginManifest,
  TriggerType,
  TriggerConfig,
  FileWatcherTrigger,
  GitHookTrigger,
  ScheduledTrigger,
  ManualTrigger,
  PluginConfig,
  PluginInitResult,
  NormalizedEventType,
  EventMetadata,
  NormalizedEvent,
  IngestPlugin,
  IngestCursorData,
  IngestSummary,
} from "./types.js";

export { PluginRegistry } from "./plugin-registry.js";
export { CursorStore } from "./cursor-store.js";
export { IngestEngine } from "./ingest-engine.js";
export {
  sanitizeContent,
  computeContentHash,
  normalizeToKnowledgeData,
  normalizeToKnowledgeEvent,
} from "./normalizer.js";

export { MarkdownPlugin } from "./plugins/markdown/index.js";
export { GitHistoryPlugin } from "./plugins/git-history/index.js";
export { ClaudeSessionsPlugin } from "./plugins/claude-sessions/index.js";
