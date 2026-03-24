import { describe, it, expect } from "vitest";
import { createLLMProvider } from "../../src/llm/provider-factory.js";
import { OllamaProvider } from "../../src/llm/ollama-provider.js";
import { OpenAICompatibleProvider } from "../../src/llm/openai-provider.js";

describe("createLLMProvider", () => {
  // 12. provider:"ollama" → OllamaProviderインスタンス
  it("provider=ollamaのときOllamaProviderインスタンスを返す", () => {
    const provider = createLLMProvider({ provider: "ollama", model: "llama3" });
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  // 13. provider:"openai" → OpenAICompatibleProviderインスタンス
  it("provider=openaiのときOpenAICompatibleProviderインスタンスを返す", () => {
    const provider = createLLMProvider({
      provider: "openai",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  // 14. undefined config → undefined返却
  it("configがundefinedのときundefinedを返す", () => {
    expect(createLLMProvider(undefined)).toBeUndefined();
  });

  it("configがnullのときundefinedを返す", () => {
    expect(createLLMProvider(null as never)).toBeUndefined();
  });
});
