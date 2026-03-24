import type {
  LLMProvider,
  LLMCompletionOptions,
  LLMCompletionResult,
  OpenAIProviderConfig,
} from "./types.js";
import { LLMProviderError } from "./errors.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_DELAY_MS = 500;

export class OpenAICompatibleProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;
  private apiKey: string | undefined;
  private maxRetries: number;
  private timeoutMs: number;
  private retryDelayMs: number;

  constructor(config: OpenAIProviderConfig) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.apiKey = config.apiKey ?? process.env["KNOWLEDGINE_LLM_API_KEY"];
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  getModelName(): string {
    return this.model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        });
        return res.status === 200;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return false;
    }
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: this.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.0,
      max_tokens: options.maxTokens ?? 1024,
    };

    if (options.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    let lastError: LLMProviderError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.status === 404) {
          throw new LLMProviderError(`Model not found: ${this.model}`, "model_not_found", {
            status: 404,
          });
        }

        if (res.status === 401) {
          throw new LLMProviderError("Unauthorized: invalid API key", "auth", { status: 401 });
        }

        if (res.status === 429 || res.status >= 500) {
          lastError = new LLMProviderError(
            `OpenAI request failed with status ${res.status}`,
            res.status === 429 ? "rate_limit" : "network",
            { status: res.status },
          );
          continue; // retry
        }

        if (!res.ok) {
          throw new LLMProviderError(`OpenAI request failed with status ${res.status}`, "network", {
            status: res.status,
          });
        }

        const data = (await res.json()) as {
          choices: Array<{ message: { role: string; content: string } }>;
          model: string;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };

        const latencyMs = Date.now() - startTime;
        return {
          content: data.choices[0].message.content,
          model: data.model,
          usage: data.usage
            ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
              }
            : undefined,
          latencyMs,
        };
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof LLMProviderError) {
          if (err.errorCode === "model_not_found" || err.errorCode === "auth") {
            throw err;
          }
          lastError = err;
          continue;
        }

        if (isAbortError(err)) {
          throw new LLMProviderError(`OpenAI request timed out after ${timeoutMs}ms`, "timeout", {
            timeoutMs,
          });
        }

        lastError = new LLMProviderError(
          `OpenAI network error: ${err instanceof Error ? err.message : String(err)}`,
          "network",
          { cause: err },
        );
        continue;
      }
    }

    throw lastError ?? new LLMProviderError("OpenAI request failed after retries", "network");
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
