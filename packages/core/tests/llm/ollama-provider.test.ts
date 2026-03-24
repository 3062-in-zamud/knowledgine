import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "../../src/llm/ollama-provider.js";
import { LLMProviderError } from "../../src/llm/errors.js";

describe("OllamaProvider", () => {
  const defaultConfig = {
    model: "llama3",
    baseUrl: "http://localhost:11434",
    maxRetries: 3,
    retryDelayMs: 10, // テスト高速化のため短く
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. isAvailable(): fetch成功→true
  it("isAvailable: /api/tags が200を返すとtrue", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ models: [] }), { status: 200 }),
    );
    const provider = new OllamaProvider(defaultConfig);
    expect(await provider.isAvailable()).toBe(true);
  });

  // 2. isAvailable(): ネットワークエラー→false
  it("isAvailable: ネットワークエラー時はfalse", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const provider = new OllamaProvider(defaultConfig);
    expect(await provider.isAvailable()).toBe(false);
  });

  // 3. complete(): 正常レスポンスのパース
  it("complete: 正常レスポンスをパースしてLLMCompletionResultを返す", async () => {
    const mockResponse = {
      message: { role: "assistant", content: "Hello, world!" },
      model: "llama3",
      eval_count: 10,
      prompt_eval_count: 5,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );
    const provider = new OllamaProvider(defaultConfig);
    const result = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(result.content).toBe("Hello, world!");
    expect(result.model).toBe("llama3");
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 10 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  // 4. complete(): 500エラー時にリトライ（3回呼ばれる）
  it("complete: 500エラー時に3回リトライして最終的にエラーを投げる", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "server error" }), { status: 500 }),
    );
    const provider = new OllamaProvider(defaultConfig);
    await expect(
      provider.complete({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toBeInstanceOf(LLMProviderError);
    // maxRetries=3: 初回+3回リトライ = 4回
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  });

  // 5. complete(): 429でリトライ、401はリトライしない（1回で終了）
  it("complete: 429でリトライする", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
    );
    const provider = new OllamaProvider(defaultConfig);
    await expect(
      provider.complete({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toBeInstanceOf(LLMProviderError);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  });

  it("complete: 401はリトライせず1回で終了", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );
    const provider = new OllamaProvider(defaultConfig);
    await expect(
      provider.complete({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toBeInstanceOf(LLMProviderError);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  // 6. complete(): タイムアウト時にLLMProviderError（errorCode: "timeout"）
  it("complete: タイムアウト時にerrorCode=timeoutのLLMProviderErrorを投げる", async () => {
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new DOMException("The operation was aborted", "AbortError")), 10),
        ),
    );
    const provider = new OllamaProvider({ ...defaultConfig, timeoutMs: 5, maxRetries: 0 });
    const err = await provider
      .complete({ messages: [{ role: "user", content: "Hi" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(LLMProviderError);
    expect((err as LLMProviderError).errorCode).toBe("timeout");
  });

  // 7. complete(): responseFormat:"json"がリクエストボディに含まれる
  it("complete: responseFormat=jsonのとき、リクエストボディにformat:jsonが含まれる", async () => {
    const mockResponse = {
      message: { role: "assistant", content: '{"key":"value"}' },
      model: "llama3",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );
    const provider = new OllamaProvider(defaultConfig);
    await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
      responseFormat: "json",
    });
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.format).toBe("json");
  });

  // 8. complete(): モデル不存在(404)時にLLMProviderError（errorCode: "model_not_found"）
  it("complete: 404のときerrorCode=model_not_foundのLLMProviderErrorを投げる", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "model not found" }), { status: 404 }),
    );
    const provider = new OllamaProvider({ ...defaultConfig, maxRetries: 0 });
    const err = await provider
      .complete({ messages: [{ role: "user", content: "Hi" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(LLMProviderError);
    expect((err as LLMProviderError).errorCode).toBe("model_not_found");
  });
});
