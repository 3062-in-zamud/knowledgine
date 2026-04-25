import { readdir, access } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  IngestPlugin,
  PluginManifest,
  TriggerConfig,
  PluginConfig,
  PluginInitResult,
  NormalizedEvent,
  SourceURI,
} from "../../types.js";
import { sanitizeContent } from "../../normalizer.js";
import { isDecisionPoint } from "../../shared/decision-detector.js";
import { computeStorageHash, getClineStorageDir } from "./storage-locator.js";
import { maxTaskMtime, parseClineTask, readTaskHistory } from "./session-parser.js";
import type { ClineHistoryItem, ClineNormalizedMessage } from "./types.js";

const MAX_HEAD_MESSAGES = 100;
const MAX_TAIL_MESSAGES = 100;
const MAX_DECISION_MESSAGES = 20;

interface ProcessContext {
  storageDir: string;
  storageHash: string;
  history: Map<string, ClineHistoryItem>;
}

function sliceUserContent(content: string): string {
  return content.slice(0, 500);
}

function sliceAssistantContent(content: string, decisionCount: { value: number }): string {
  if (isDecisionPoint(content) && decisionCount.value < MAX_DECISION_MESSAGES) {
    decisionCount.value += 1;
    return content.slice(0, 500);
  }
  return content.slice(0, 200);
}

function buildSummary(
  messages: ClineNormalizedMessage[],
  history: ClineHistoryItem | undefined,
  taskId: string,
): string {
  const head = messages.slice(0, MAX_HEAD_MESSAGES);
  const tail =
    messages.length > MAX_HEAD_MESSAGES + MAX_TAIL_MESSAGES
      ? messages.slice(messages.length - MAX_TAIL_MESSAGES)
      : [];
  const truncated = Math.max(0, messages.length - head.length - tail.length);

  const decisionCount = { value: 0 };
  const renderMessage = (m: ClineNormalizedMessage): string => {
    const marker = m.role === "user" ? "### User:" : "### Assistant:";
    const content =
      m.role === "user"
        ? sliceUserContent(m.content)
        : sliceAssistantContent(m.content, decisionCount);
    return `${marker}\n${content}`;
  };

  const headBlock = head.map(renderMessage).join("\n\n---\n\n");
  const tailBlock = tail.length > 0 ? tail.map(renderMessage).join("\n\n---\n\n") : "";

  const sections: string[] = [
    `Task: ${taskId}`,
    history?.task ? `Prompt: ${history.task.slice(0, 200)}` : null,
    history?.cwdOnTaskInitialization ? `Workspace: ${history.cwdOnTaskInitialization}` : null,
    history?.modelId ? `Model: ${history.modelId}` : null,
    `Messages: ${messages.length}`,
    "",
    "## Conversation",
    "",
    headBlock || "(no head messages)",
  ].filter((line): line is string => line !== null);

  if (truncated > 0) {
    sections.push("\n---\n", `(... ${truncated} messages truncated ...)`, "\n---\n");
  }
  if (tailBlock) {
    sections.push(tailBlock);
  }

  return sections.join("\n");
}

function deriveTitle(history: ClineHistoryItem | undefined, taskId: string): string {
  const taskText = history?.task?.trim();
  if (taskText) {
    const oneLine = taskText.replace(/\s+/g, " ").trim();
    return `Cline: ${oneLine.slice(0, 60)}`;
  }
  return `Cline: ${taskId.slice(0, 8)}`;
}

function buildTags(history: ClineHistoryItem | undefined): string[] {
  const cwd = history?.cwdOnTaskInitialization;
  const cwdTag = cwd ? `cwd:${basename(cwd)}` : "cwd:unknown";
  return ["cline", "ai-session", cwdTag];
}

function buildEvent(
  taskId: string,
  ctx: ProcessContext,
  messages: ClineNormalizedMessage[],
): NormalizedEvent {
  const history = ctx.history.get(taskId);
  const summary = buildSummary(messages, history, taskId);
  const ts =
    history?.ts && Number.isFinite(history.ts)
      ? new Date(history.ts)
      : (messages[0]?.timestamp ?? new Date(0));

  return {
    sourceUri: `cline-session://${ctx.storageHash}/${taskId}`,
    eventType: "capture",
    title: deriveTitle(history, taskId),
    content: sanitizeContent(summary),
    timestamp: ts,
    metadata: {
      sourcePlugin: "cline-sessions",
      sourceId: taskId,
      tags: buildTags(history),
      extra: {
        taskId,
        ulid: history?.ulid,
        workspace: history?.cwdOnTaskInitialization,
        modelId: history?.modelId,
        tokensIn: history?.tokensIn,
        tokensOut: history?.tokensOut,
        totalCost: history?.totalCost,
        size: history?.size,
        messageCount: messages.length,
      },
    },
  };
}

async function findTaskIds(storageDir: string): Promise<string[]> {
  try {
    const entries = await readdir(join(storageDir, "tasks"), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export class ClineSessionsPlugin implements IngestPlugin {
  readonly manifest: PluginManifest = {
    id: "cline-sessions",
    name: "Cline Sessions",
    version: "0.1.0",
    schemes: ["cline-session://"],
    priority: 1,
  };

  // Manual only. The runtime does not currently consume `file_watcher` triggers
  // declared by other session plugins, so we avoid declaring dead config.
  readonly triggers: TriggerConfig[] = [{ type: "manual" }];

  async initialize(_config?: PluginConfig): Promise<PluginInitResult> {
    const override = process.env["CLINE_STORAGE_PATH"];
    if (override && override.length > 0) {
      try {
        await access(override);
      } catch {
        // Visible side-effect — surface the misconfiguration without breaking
        // the ingest run (graceful skip downstream still produces 0 events).
        process.stderr.write(`⚠ CLINE_STORAGE_PATH does not exist: ${override}\n`);
      }
    }
    return { ok: true };
  }

  async *ingestAll(sourceUri: SourceURI): AsyncGenerator<NormalizedEvent> {
    const ctx = await this.buildContext(sourceUri);
    const taskIds = await findTaskIds(ctx.storageDir);
    for (const taskId of taskIds) {
      const event = await this.processTask(taskId, ctx);
      if (event) yield event;
    }
  }

  async *ingestIncremental(
    sourceUri: SourceURI,
    checkpoint: string,
  ): AsyncGenerator<NormalizedEvent> {
    const ctx = await this.buildContext(sourceUri);
    const parsedCheckpoint = new Date(checkpoint);
    const since = Number.isNaN(parsedCheckpoint.getTime()) ? new Date(0) : parsedCheckpoint;
    const taskIds = await findTaskIds(ctx.storageDir);
    for (const taskId of taskIds) {
      const taskDir = join(ctx.storageDir, "tasks", taskId);
      const mtime = await maxTaskMtime(taskDir);
      if (mtime < since.getTime()) continue;
      const event = await this.processTask(taskId, ctx);
      if (event) yield event;
    }
  }

  async getCurrentCheckpoint(sourceUri: SourceURI): Promise<string> {
    const storageDir = sourceUri || getClineStorageDir();
    const taskIds = await findTaskIds(storageDir);
    if (taskIds.length === 0) return new Date(0).toISOString();
    const mtimes = await Promise.all(
      taskIds.map((id) => maxTaskMtime(join(storageDir, "tasks", id))),
    );
    const max = Math.max(0, ...mtimes);
    return max > 0 ? new Date(max).toISOString() : new Date(0).toISOString();
  }

  async dispose(): Promise<void> {
    // no-op
  }

  private async buildContext(sourceUri: SourceURI): Promise<ProcessContext> {
    const storageDir = sourceUri || getClineStorageDir();
    const storageHash = computeStorageHash(storageDir);
    const history = await readTaskHistory(storageDir);
    const map = new Map<string, ClineHistoryItem>();
    for (const item of history) map.set(item.id, item);
    return { storageDir, storageHash, history: map };
  }

  private async processTask(taskId: string, ctx: ProcessContext): Promise<NormalizedEvent | null> {
    const taskDir = join(ctx.storageDir, "tasks", taskId);
    const result = await parseClineTask(taskDir);
    if (result.skipReason) {
      process.stderr.write(`⚠ Skipped (${basename(taskDir)}): ${result.skipReason}\n`);
      return null;
    }
    if (result.messages.length === 0) {
      return null;
    }
    return buildEvent(taskId, ctx, result.messages);
  }
}
