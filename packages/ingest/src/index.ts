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
export { EventWriter } from "./event-writer.js";
export {
  sanitizeContent,
  computeContentHash,
  normalizeToKnowledgeData,
  normalizeToKnowledgeEvent,
} from "./normalizer.js";

export { MarkdownPlugin } from "./plugins/markdown/index.js";
export { GitHistoryPlugin } from "./plugins/git-history/index.js";
export { ClaudeSessionsPlugin } from "./plugins/claude-sessions/index.js";
export { GitHubPlugin } from "./plugins/github/index.js";
export {
  createRepositoryNotFoundError,
  isRepositoryNotFoundError,
} from "./plugins/github/gh-parser.js";
export { ObsidianPlugin } from "./plugins/obsidian/index.js";
export { CursorSessionsPlugin } from "./plugins/cursor-sessions/index.js";
export { ClineSessionsPlugin } from "./plugins/cline-sessions/index.js";
export { CicdPlugin } from "./plugins/cicd/index.js";
