import { resolve } from "path";
import {
  loadConfig,
  resolveDefaultPath,
  createDatabase,
  Migrator,
  ALL_MIGRATIONS,
  FeedbackRepository,
  FeedbackLearner,
} from "@knowledgine/core";
import type { FeedbackErrorType } from "@knowledgine/core";
import { createTable, colors, symbols } from "../lib/ui/index.js";

function createFeedbackDeps(rootPath: string): {
  feedbackRepository: FeedbackRepository;
  feedbackLearner: FeedbackLearner;
} {
  const config = loadConfig(rootPath);
  const db = createDatabase(config.dbPath);
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const feedbackRepository = new FeedbackRepository(db);
  const rulesPath = resolve(rootPath, ".knowledgine", "extraction-rules.json");
  const feedbackLearner = new FeedbackLearner(feedbackRepository, rulesPath);
  return { feedbackRepository, feedbackLearner };
}

function statusColor(status: string): string {
  switch (status) {
    case "pending":
      return colors.warning(status);
    case "applied":
      return colors.success(status);
    case "dismissed":
      return colors.dim(status);
    default:
      return status;
  }
}

export interface FeedbackListOptions {
  status?: string;
  path?: string;
}

export async function feedbackListCommand(options: FeedbackListOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const { feedbackRepository } = createFeedbackDeps(rootPath);

  const records = feedbackRepository.list({ status: options.status });

  if (records.length === 0) {
    console.log("No feedback records found.");
    return;
  }

  const rows = records.map((r) => [
    String(r.id),
    r.errorType,
    r.entityName,
    statusColor(r.status),
  ]);

  console.log(createTable({ head: ["ID", "Error Type", "Entity", "Status"], rows }));
}

export interface FeedbackApplyOptions {
  path?: string;
}

export async function feedbackApplyCommand(
  idStr: string,
  options: FeedbackApplyOptions,
): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const { feedbackLearner } = createFeedbackDeps(rootPath);
  const id = parseInt(idStr, 10);

  if (isNaN(id) || id <= 0) {
    console.error(`${symbols.error} Invalid feedback ID: ${idStr}`);
    process.exitCode = 1;
    return;
  }

  try {
    feedbackLearner.applyFeedback(id);
    console.log(`${symbols.success} Feedback #${id} applied successfully. Extraction rules updated.`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export interface FeedbackDismissOptions {
  path?: string;
}

export async function feedbackDismissCommand(
  idStr: string,
  options: FeedbackDismissOptions,
): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const { feedbackRepository } = createFeedbackDeps(rootPath);
  const id = parseInt(idStr, 10);

  if (isNaN(id) || id <= 0) {
    console.error(`${symbols.error} Invalid feedback ID: ${idStr}`);
    process.exitCode = 1;
    return;
  }

  try {
    feedbackRepository.updateStatus(id, "dismissed");
    console.log(`${symbols.success} Feedback #${id} dismissed.`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export interface FeedbackStatsOptions {
  path?: string;
}

export async function feedbackStatsCommand(options: FeedbackStatsOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);
  const { feedbackRepository } = createFeedbackDeps(rootPath);

  const stats = feedbackRepository.getStats();
  console.log("Feedback Statistics:");
  console.log(`  Total:     ${stats.total}`);
  console.log(`  Pending:   ${stats.pending}`);
  console.log(`  Applied:   ${stats.applied}`);
  console.log(`  Dismissed: ${stats.dismissed}`);
}

const VALID_ERROR_TYPES: FeedbackErrorType[] = ["false_positive", "wrong_type", "missed_entity"];

export interface FeedbackReportOptions {
  entity: string;
  type: string;
  entityType?: string;
  correctType?: string;
  details?: string;
  path?: string;
}

export async function feedbackReportCommand(options: FeedbackReportOptions): Promise<void> {
  const rootPath = resolveDefaultPath(options.path);

  if (!VALID_ERROR_TYPES.includes(options.type as FeedbackErrorType)) {
    console.error(
      `${symbols.error} Error: Invalid error type "${options.type}". Must be one of: ${VALID_ERROR_TYPES.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const { feedbackRepository } = createFeedbackDeps(rootPath);

  try {
    const record = feedbackRepository.create({
      entityName: options.entity,
      errorType: options.type as FeedbackErrorType,
      entityType: options.entityType,
      correctType: options.correctType,
      details: options.details,
    });
    console.log(`${symbols.success} Feedback #${record.id} created.`);
    console.log(`  Entity:     ${record.entityName}`);
    console.log(`  Error type: ${record.errorType}`);
    if (record.entityType) console.log(`  Type:       ${record.entityType}`);
    if (record.correctType) console.log(`  Correct:    ${record.correctType}`);
    if (record.details) console.log(`  Details:    ${record.details}`);
    console.log(`  Status:     ${statusColor(record.status)}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
