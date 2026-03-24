import { KnowledgeError } from "../errors.js";

export type LLMErrorCode =
  | "connection_refused"
  | "timeout"
  | "auth"
  | "rate_limit"
  | "model_not_found"
  | "parse_error"
  | "network";

/** Error thrown when an LLM provider operation fails */
export class LLMProviderError extends KnowledgeError {
  constructor(
    message: string,
    public readonly errorCode: LLMErrorCode,
    context?: Record<string, unknown>,
  ) {
    super(message, { errorCode, ...context });
    this.name = "LLMProviderError";
  }
}
