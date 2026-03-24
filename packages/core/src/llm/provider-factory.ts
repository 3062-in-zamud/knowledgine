import type { LLMConfig, LLMProvider } from "./types.js";
import { OllamaProvider } from "./ollama-provider.js";
import { OpenAICompatibleProvider } from "./openai-provider.js";

export function createLLMProvider(config: LLMConfig | undefined): LLMProvider | undefined {
  if (!config) return undefined;

  switch (config.provider) {
    case "ollama": {
      const ollamaConfig = config.ollama ?? {
        model: config.model ?? "llama3",
        baseUrl: config.baseUrl,
      };
      return new OllamaProvider(ollamaConfig);
    }
    case "openai": {
      const openaiConfig = config.openai ?? {
        model: config.model ?? "gpt-4o",
        baseUrl: config.baseUrl ?? "https://api.openai.com",
      };
      return new OpenAICompatibleProvider(openaiConfig);
    }
    default:
      return undefined;
  }
}
