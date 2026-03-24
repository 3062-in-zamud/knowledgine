import type {
  LLMProvider,
  LLMCompletionOptions,
  LLMCompletionResult,
} from "../../src/llm/types.js";

/**
 * テスト用固定レスポンスLLMプロバイダー。
 * コンストラクタで応答内容を設定可能。
 */
export class MockLLMProvider implements LLMProvider {
  private responseContent: string;
  private modelName: string;
  private available: boolean;
  public callCount = 0;
  public lastOptions: LLMCompletionOptions | null = null;

  constructor(responseContent = "mock response", modelName = "mock-model", available = true) {
    this.responseContent = responseContent;
    this.modelName = modelName;
    this.available = available;
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    this.callCount++;
    this.lastOptions = options;
    return {
      content: this.responseContent,
      usage: { promptTokens: 10, completionTokens: 5 },
      model: this.modelName,
      latencyMs: 1,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  getModelName(): string {
    return this.modelName;
  }
}
