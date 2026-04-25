/**
 * Extract plain text from a content field that may be a string or
 * an Anthropic-style content block array (e.g. `[{ type: "text", text: "..." }]`).
 *
 * - String → returned as-is
 * - Array → only `type === "text"` blocks are concatenated; non-text blocks
 *   (e.g. `tool_use`, `tool_result`, `image`) are dropped
 * - Anything else → empty string
 */
export function extractTextContent(
  content: string | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (block): block is { type: string; text: string } =>
        block !== null &&
        typeof block === "object" &&
        block.type === "text" &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("");
}
