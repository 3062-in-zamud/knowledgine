import { loadRcFile, resolveDefaultPath, NoteTransferService } from "@knowledgine/core";
import type { ProjectEntry } from "@knowledgine/core";
import { resolveProjectArgs } from "../lib/resolve-project-args.js";
import { colors, symbols } from "../lib/ui/index.js";

export interface TransferCommandOptions {
  from: string;
  to: string;
  noteId: string;
  dryRun?: boolean;
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
): ResolvedSingle | ResolvedFailure {
  const result = resolveProjectArgs(rawArg, rcProjects);
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

export async function transferCommand(options: TransferCommandOptions): Promise<void> {
  const format = (options.format as "json" | "plain") ?? "plain";
  const isJson = format === "json";

  const rootPath = resolveDefaultPath(options.path);
  const rcConfig = loadRcFile(rootPath);
  const rcProjects = rcConfig?.projects ?? [];
  const callerSelfName = rcConfig?.selfName ?? null;

  const fromResolved = resolveSingleProject(options.from, rcProjects);
  if (!fromResolved.ok) {
    emitError(`--from: ${fromResolved.message}`, isJson);
    process.exitCode = 1;
    return;
  }
  const toResolved = resolveSingleProject(options.to, rcProjects);
  if (!toResolved.ok) {
    emitError(`--to: ${toResolved.message}`, isJson);
    process.exitCode = 1;
    return;
  }

  const fromProject = mergeRcMetadata(fromResolved.project, rcProjects);
  const toProject = mergeRcMetadata(toResolved.project, rcProjects);

  const noteId = Number(options.noteId);
  if (!Number.isInteger(noteId) || noteId <= 0) {
    emitError(`--note-id must be a positive integer (got "${options.noteId}").`, isJson);
    process.exitCode = 1;
    return;
  }

  const service = new NoteTransferService({ callerSelfName });
  try {
    const result = await service.transferNote({
      sourceProject: fromProject,
      targetProject: toProject,
      sourceNoteId: noteId,
      options: { dryRun: options.dryRun === true },
    });

    if (isJson) {
      console.log(
        JSON.stringify({
          ok: true,
          command: "transfer",
          dryRun: options.dryRun === true,
          result,
        }),
      );
    } else {
      const action = options.dryRun ? "[dry-run] would transfer" : "Transferred";
      console.error(
        `${symbols.success} ${colors.bold(action)} note #${result.sourceNoteId} from ` +
          `${fromProject.name} to ${toProject.name}` +
          (options.dryRun ? "" : ` as #${result.targetNoteId}`),
      );
      if (result.copiedTables.length > 0) {
        console.error(`  ${colors.hint("Copied:")} ${result.copiedTables.join(", ")}`);
      }
      if (result.skipped.length > 0) {
        console.error(`  ${colors.hint("Skipped:")} ${result.skipped.join(", ")}`);
      }
      for (const w of result.warnings) {
        console.error(`  ${symbols.warning} ${colors.warning(w)}`);
      }
    }
  } catch (err) {
    emitError(err instanceof Error ? err.message : String(err), isJson);
    process.exitCode = 1;
  }
}

function emitError(message: string, isJson: boolean): void {
  if (isJson) {
    console.log(JSON.stringify({ ok: false, command: "transfer", error: message }));
  } else {
    console.error(`${symbols.error} ${colors.error(message)}`);
  }
}

function mergeRcMetadata(
  resolved: ProjectEntry,
  rcProjects: ReadonlyArray<{
    name: string;
    path: string;
    visibility?: "private" | "public";
    allowFrom?: string[];
  }>,
): ProjectEntry {
  // resolveProjectArgs returns { name, path } only; copy visibility/allowFrom
  // from the rc entry (when matched by name) so VisibilityGate sees them.
  const matched = rcProjects.find((p) => p.name === resolved.name);
  if (!matched) return resolved;
  return {
    name: resolved.name,
    path: resolved.path,
    visibility: matched.visibility,
    allowFrom: matched.allowFrom,
  };
}
