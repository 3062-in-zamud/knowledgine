import type { KnowledgeVector, KnowledgeVectorCategory } from "./types.js";
import type { ExtractedPattern } from "../types.js";
import type { ExtractedEntity } from "../graph/entity-extractor.js";

const VALID_CATEGORIES = new Set<KnowledgeVectorCategory>([
  "personal_info",
  "preferences",
  "events",
  "temporal_data",
  "updates",
  "assistant_info",
]);

/** 日付パターン: YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY など */
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{4}\/\d{2}\/\d{2}\b/g,
  /\b\d{2}\/\d{2}\/\d{4}\b/g,
];

/** バージョンパターン: v1.2.3, v10.0.0-beta など */
const VERSION_PATTERNS = [/\bv\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?\b/g];

/** テクノロジー・ツール関連のエンティティタイプ */
const TECHNOLOGY_ENTITY_TYPES = new Set(["technology", "tool"]);

/** プロジェクト・組織関連のエンティティタイプ */
const PROJECT_ENTITY_TYPES = new Set(["project", "organization"]);

/**
 * ExtractedPatternをKnowledgeVectorカテゴリにマッピング
 */
function mapPatternToCategory(
  patternType: ExtractedPattern["type"],
): KnowledgeVectorCategory | null {
  switch (patternType) {
    case "problem":
    case "solution":
    case "learning":
      return "events";
    case "time":
      return "temporal_data";
    default:
      return null;
  }
}

/**
 * ExtractedEntityをKnowledgeVectorカテゴリにマッピング
 */
function mapEntityToCategory(entityType: string): KnowledgeVectorCategory | null {
  if (entityType === "person") {
    return "personal_info";
  }
  if (TECHNOLOGY_ENTITY_TYPES.has(entityType)) {
    return "preferences";
  }
  if (PROJECT_ENTITY_TYPES.has(entityType)) {
    return "assistant_info";
  }
  return null;
}

/**
 * frontmatterのフィールドからKnowledgeVectorを生成
 */
function classifyFromFrontmatter(frontmatter: Record<string, unknown>): KnowledgeVector[] {
  const vectors: KnowledgeVector[] = [];

  // author/assignee → personal_info
  for (const field of ["author", "assignee"]) {
    const val = frontmatter[field];
    if (typeof val === "string" && val.trim()) {
      vectors.push({
        category: "personal_info",
        content: `${field}: ${val.trim()}`,
        confidence: 0.9,
        source: "rule",
        metadata: { field },
      });
    } else if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "string" && v.trim()) {
          vectors.push({
            category: "personal_info",
            content: `${field}: ${v.trim()}`,
            confidence: 0.9,
            source: "rule",
            metadata: { field },
          });
        }
      }
    }
  }

  // tags → preferences（ツール・技術名を含む場合）
  const tags = frontmatter["tags"];
  if (Array.isArray(tags) && tags.length > 0) {
    const tagList = tags
      .filter((t): t is string => typeof t === "string" && t.trim() !== "")
      .map((t) => t.trim());

    if (tagList.length > 0) {
      vectors.push({
        category: "preferences",
        content: `tags: ${tagList.join(", ")}`,
        confidence: 0.75,
        source: "rule",
        metadata: { tags: tagList },
      });
    }
  }

  return vectors;
}

/**
 * content内の日付・バージョンパターンからtemporal_dataベクトルを生成
 */
function classifyTemporalFromContent(content: string): KnowledgeVector[] {
  const vectors: KnowledgeVector[] = [];
  const seen = new Set<string>();

  for (const pattern of DATE_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const text = match[0];
      if (!seen.has(text)) {
        seen.add(text);
        vectors.push({
          category: "temporal_data",
          content: text,
          confidence: 0.85,
          source: "rule",
          metadata: { patternType: "date" },
        });
      }
    }
  }

  for (const pattern of VERSION_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const text = match[0];
      if (!seen.has(text)) {
        seen.add(text);
        vectors.push({
          category: "temporal_data",
          content: text,
          confidence: 0.8,
          source: "rule",
          metadata: { patternType: "version" },
        });
      }
    }
  }

  return vectors;
}

/**
 * ルールベースの6ベクトル分類
 * PatternExtractorとEntityExtractorの出力を6ベクトルにマッピングする
 */
export function classifyByRules(
  patterns: ExtractedPattern[],
  entities: ExtractedEntity[],
  frontmatter: Record<string, unknown>,
  content: string,
): KnowledgeVector[] {
  const vectors: KnowledgeVector[] = [];

  // PatternExtractor出力をマッピング
  for (const pattern of patterns) {
    const category = mapPatternToCategory(pattern.type);
    if (category === null) continue;

    vectors.push({
      category,
      content: pattern.content,
      confidence: pattern.confidence,
      source: "rule",
      metadata: {
        patternType: pattern.type,
        lineNumber: pattern.lineNumber,
        contextType: pattern.contextType,
      },
    });
  }

  // EntityExtractor出力をマッピング
  for (const entity of entities) {
    const category = mapEntityToCategory(entity.entityType);
    if (category === null) continue;

    vectors.push({
      category,
      content: entity.name,
      confidence: 0.8,
      source: "rule",
      metadata: {
        entityType: entity.entityType,
        sourceType: entity.sourceType,
      },
    });
  }

  // frontmatterのフィールドから分類
  vectors.push(...classifyFromFrontmatter(frontmatter));

  // content内の日付・バージョンパターンから分類
  vectors.push(...classifyTemporalFromContent(content));

  return vectors;
}

/**
 * LLMのJSON配列レスポンスをパースしてKnowledgeVectorに変換する
 * パース失敗時はnullを返す
 */
export function parseLLMVectorResponse(content: string): KnowledgeVector[] | null {
  // JSONの配列部分を抽出する
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const raw = JSON.parse(content.slice(start, end + 1)) as unknown;
    if (!Array.isArray(raw)) return null;

    const vectors: KnowledgeVector[] = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;

      const category = obj["category"];
      const itemContent = obj["content"];
      const confidence = obj["confidence"];

      if (
        typeof category !== "string" ||
        typeof itemContent !== "string" ||
        typeof confidence !== "number"
      ) {
        continue;
      }

      // 有効なカテゴリのみ受け付ける
      if (!VALID_CATEGORIES.has(category as KnowledgeVectorCategory)) {
        continue;
      }

      vectors.push({
        category: category as KnowledgeVectorCategory,
        content: itemContent,
        confidence: Math.max(0, Math.min(1, confidence)),
        source: "llm",
      });
    }

    return vectors;
  } catch {
    return null;
  }
}
