import { loadRcFile, resolveDefaultPath, NoteLinkService } from "@knowledgine/core";
import type { ProjectEntry } from "@knowledgine/core";
import { resolveProjectArgs } from "../lib/resolve-project-args.js";
import { colors, symbols } from "../lib/ui/index.js";

export interface LinkCommandOptions {
  source: string;
  noteId: string;
  into: string;
  format?: string;
  path?: string;
}

export interface ShowLinkCommandOptions {
  stubId: string;
  format?: string;
  path?: string;
}

interface ResolvedSingle {
  ok: true;
  project: ProjectEntry;
}
interface ResolvedFailure {
  ok: false;
  message: string;
}

function resolveSingleProject(
  rawArg: string,
  rcProjects: ReadonlyArray<{ name: string; path: string }>,
  cwd: string,
): ResolvedSingle | ResolvedFailure {
  // Same reasoning as transfer.ts: resolve relative paths against the
  // rc-root so --path selects a consistent reference frame.
  const result = resolveProjectArgs(rawArg, rcProjects, { cwd });
  if (result.resolved.length === 0) {
    if (result.unresolvedNames.length > 0) {
      return {
        ok: false,
        message: `unknown project name "${result.unresolvedNames[0]}". Register it in .knowledginerc or pass an absolute / relative path.`,
      };
    }
    if (result.unresolvedPaths.length > 0) {
      return {
        ok: false,
        message: `path "${result.unresolvedPaths[0]}" has no .knowledgine/index.sqlite. Run 'knowledgine init --path <dir>' first.`,
      };
    }
    return { ok: false, message: `could not resolve project "${rawArg}".` };
  }
  return { ok: true, project: result.resolved[0] };
}

function emitError(command: string, message: string, isJson: boolean): void {
  if (isJson) {
    console.log(JSON.stringify({ ok: false, command, error: message }));
  } else {
    console.error(`${symbols.error} ${colors.error(message)}`);
  }
}

export async function linkCommand(options: LinkCommandOptions): Promise<void> {
  const format = (options.format as "json" | "plain") ?? "plain";
  const isJson = format === "json";

  const rootPath = resolveDefaultPath(options.path);
  const rcConfig = loadRcFile(rootPath);
  const rcProjects = rcConfig?.projects ?? [];
  const callerSelfName = rcConfig?.selfName ?? null;

  const sourceResolved = resolveSingleProject(options.source, rcProjects, rootPath);
  if (!sourceResolved.ok) {
    emitError("link", `--source: ${sourceResolved.message}`, isJson);
    process.exitCode = 1;
    return;
  }
  const intoResolved = resolveSingleProject(options.into, rcProjects, rootPath);
  if (!intoResolved.ok) {
    emitError("link", `--into: ${intoResolved.message}`, isJson);
    process.exitCode = 1;
    return;
  }

  // resolveProjectArgs already attaches visibility / allowFrom from the rc
  // entry whether the input was a registered name or a filesystem path.
  const sourceProject = sourceResolved.project;
  const intoProject = intoResolved.project;

  const noteId = Number(options.noteId);
  if (!Number.isInteger(noteId) || noteId <= 0) {
    emitError("link", `--note-id must be a positive integer (got "${options.noteId}").`, isJson);
    process.exitCode = 1;
    return;
  }

  const service = new NoteLinkService({ callerSelfName });
  try {
    const result = await service.linkNote({
      sourceProject,
      targetProject: intoProject,
      sourceNoteId: noteId,
    });
    if (isJson) {
      console.log(JSON.stringify({ ok: true, command: "link", result }));
    } else {
      console.error(
        `${symbols.success} ${colors.bold("Linked")} note #${result.sourceNoteId} from ` +
          `${sourceProject.name} into ${intoProject.name} as stub #${result.targetNoteId} ` +
          `(link row #${result.linkRowId})`,
      );
    }
  } catch (err) {
    emitError("link", err instanceof Error ? err.message : String(err), isJson);
    process.exitCode = 1;
  }
}

export async function showLinkCommand(options: ShowLinkCommandOptions): Promise<void> {
  const format = (options.format as "json" | "plain") ?? "plain";
  const isJson = format === "json";

  const rootPath = resolveDefaultPath(options.path);
  const rcConfig = loadRcFile(rootPath);
  const callerSelfName = rcConfig?.selfName ?? null;

  const stubId = Number(options.stubId);
  if (!Number.isInteger(stubId) || stubId <= 0) {
    emitError(
      "show-link",
      `<stub-id> must be a positive integer (got "${options.stubId}").`,
      isJson,
    );
    process.exitCode = 1;
    return;
  }

  const service = new NoteLinkService({ callerSelfName });
  try {
    const result = await service.resolveLink(
      { name: rcConfig?.selfName ?? "(local)", path: rootPath },
      stubId,
    );

    if (isJson) {
      console.log(
        JSON.stringify({
          ok: true,
          command: "show-link",
          stubId,
          result,
        }),
      );
      return;
    }

    if (result.status === "ok") {
      console.error(`${symbols.success} ${colors.bold(result.sourceNote.title)}`);
      console.error("");
      console.log(result.sourceNote.content);
      console.error("");
      console.error(colors.hint(`(resolved from source at ${result.lastResolvedAt})`));
    } else if (result.status === "source_missing") {
      console.error(`${symbols.warning} ${colors.warning(`[broken link: ${result.reason}]`)}`);
      console.error(colors.hint(`The source project is no longer reachable.`));
    } else {
      console.error(`${symbols.warning} ${colors.warning(`[broken link: note_deleted]`)}`);
      console.error(colors.hint(`The source project is reachable but the linked note is gone.`));
    }
  } catch (err) {
    emitError("show-link", err instanceof Error ? err.message : String(err), isJson);
    process.exitCode = 1;
  }
}
