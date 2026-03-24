export interface LLMCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  messages: LLMCompletionMessage[];
  temperature?: number; // default 0.0
  maxTokens?: number; // default 1024
  responseFormat?: "text" | "json";
  timeoutMs?: number; // default 30000
}

export interface LLMCompletionResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
  model: string;
  latencyMs: number;
}

export interface LLMProvider {
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResult>;
  isAvailable(): Promise<boolean>;
  getModelName(): string;
}

export interface OllamaProviderConfig {
  baseUrl?: string; // default "http://localhost:11434"
  model: string;
  maxRetries?: number; // default 3
  timeoutMs?: number; // default 30000
  retryDelayMs?: number; // default 500
}

export interface OpenAIProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string; // env fallback: KNOWLEDGINE_LLM_API_KEY
  maxRetries?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  rateLimitRPM?: number; // default: 60
}

export type LLMProviderType = "ollama" | "openai";

export interface LLMConfig {
  provider: LLMProviderType;
  model?: string;
  baseUrl?: string;
  ollama?: OllamaProviderConfig;
  openai?: OpenAIProviderConfig;
}
