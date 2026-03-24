// SourceURI: string alias for source identifiers
export type SourceURI = string;

// Plugin manifest priority: 0 (lowest) to 3 (highest)
export type PluginPriority = 0 | 1 | 2 | 3;

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** URI schemes this plugin handles (e.g. ["file://", "git://"]) */
  schemes: string[];
  /** Optional list of plugin IDs this plugin requires */
  requires?: string[];
  priority: PluginPriority;
}

// Trigger types
export type TriggerType = "file_watcher" | "git_hook" | "scheduled" | "manual";

export interface FileWatcherTrigger {
  type: "file_watcher";
  paths?: string[];
  ignore?: string[];
}

export interface GitHookTrigger {
  type: "git_hook";
  hook: "post-commit" | "post-merge" | "post-checkout";
}

export interface ScheduledTrigger {
  type: "scheduled";
  cron: string;
}

export interface ManualTrigger {
  type: "manual";
}

export type TriggerConfig = FileWatcherTrigger | GitHookTrigger | ScheduledTrigger | ManualTrigger;

export interface PluginConfig {
  [key: string]: unknown;
}

export interface PluginInitResult {
  ok: boolean;
  error?: string;
}

// Normalized event types
export type NormalizedEventType =
  | "commit"
  | "change"
  | "diff"
  | "session"
  | "session_event"
  | "document"
  | "discussion"
  | "review"
  | "ci_result"
  | "decision"
  | "learning"
  | "problem_solution"
  | "capture";

export interface EventMetadata {
  sourcePlugin: string;
  sourceId: string;
  author?: string;
  project?: string;
  branch?: string;
  entities?: string[];
  tags?: string[];
  confidence?: number;
  extra?: Record<string, unknown>;
}

export interface NormalizedEvent {
  sourceUri: SourceURI;
  eventType: NormalizedEventType;
  title: string;
  content: string;
  timestamp: Date;
  metadata: EventMetadata;
  relatedPaths?: string[];
  rawData?: unknown;
}

export interface IngestPlugin {
  readonly manifest: PluginManifest;
  readonly triggers: TriggerConfig[];

  initialize(config?: PluginConfig): Promise<PluginInitResult>;

  ingestAll(sourceUri: SourceURI): AsyncGenerator<NormalizedEvent>;

  ingestIncremental(sourceUri: SourceURI, checkpoint: string): AsyncGenerator<NormalizedEvent>;

  getCurrentCheckpoint(sourceUri: SourceURI): Promise<string>;

  dispose(): Promise<void>;
}

export interface IngestCursorData {
  pluginId: string;
  sourcePath: string;
  checkpoint: string;
  lastIngestAt: Date;
}

export interface IngestSummary {
  pluginId: string;
  processed: number;
  errors: number;
  deleted: number;
  skipped: number;
  elapsedMs: number;
  /** IDs of knowledge_notes records created/updated during this ingest run */
  noteIds?: number[];
}
