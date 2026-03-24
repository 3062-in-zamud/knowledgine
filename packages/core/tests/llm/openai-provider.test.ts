import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAICompatibleProvider } from "../../src/llm/openai-provider.js";
import { LLMProviderError } from "../../src/llm/errors.js";

describe("OpenAICompatibleProvider", () => {
  const defaultConfig = {
    baseUrl: "https://api.example.com",
    model: "gpt-4o",
    apiKey: "test-api-key",
    maxRetries: 3,
    retryDelayMs: 10,
  };

  const makeSuccessResponse = (content = "Hello!") => ({
    choices: [{ message: { role: "assistant", content } }],
    model: "gpt-4o",
    usage: { prompt_tokens: 5, completion_tokens: 10 },
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    delete process.env["KNOWLEDGINE_LLM_API_KEY"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["KNOWLEDGINE_LLM_API_KEY"];
  });

  // 1. isAvailable(): fetch成功→true
  it("isAvailable: モデルエンドポイントが200を返すとtrue", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(makeSuccessResponse()), { status: 200 }),
    );
    const provider = new OpenAICompatibleProvider(defaultConfig);
    expect(await provider.isAvailable()).toBe(true);
  });

  // 2. isAvailable(): ネットワークエラー→false
  it("isAvailable: ネットワークエラー時はfalse", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const provider = new OpenAICompatibleProvider(defaultConfig);
    expect(await provider.isAvailable()).toBe(false);
  });

  // 3. complete(): 正常レスポンスのパース
  it("complete: 正常レスポンスをパースしてLLMCompletionResultを返す", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(makeSuccessResponse("Test response")), { status: 200 }),
    );
    const provider = new OpenAICompatibleProvider(defaultConfig);
    const result = await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(result.content).toBe("Test response");
    expect(result.model).toBe("gpt-4o");
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 10 });
  });

  // 4. complete(): 500エラー時にリトライ（3回呼ばれる）
  it("complete: 500エラー時に3回リトライして最終的にエラーを投げる", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "server error" } }), { status: 500 }),
    );
    const provider = new OpenAICompatibleProvider(defaultConfig);
    await expect(
      provider.complete({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toBeInstanceOf(LLMProviderError);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  });

  // 5. complete(): 429でリトライ、401はリトライしない（1回で終了）
  it("complete: 429でリトライする", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }),
    );
    const provider = new OpenAICompatibleProvider(defaultConfig);
    await expect(
      provider.complete({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toBeInstanceOf(LLMProviderError);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  });

  it("complete: 401はリトライせず1回で終了", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "unauthorized" } }), { status: 401 }),
    );
    const provider = new OpenAICompatibleProvider(defaultConfig);
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
    const provider = new OpenAICompatibleProvider({
      ...defaultConfig,
      timeoutMs: 5,
      maxRetries: 0,
    });
    const err = await provider
      .complete({ messages: [{ role: "user", content: "Hi" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(LLMProviderError);
    expect((err as LLMProviderError).errorCode).toBe("timeout");
  });

  // 7. complete(): responseFormat:"json" → response_format: { type: "json_object" }
  it("complete: responseFormat=jsonのとき、リクエストボディにresponse_format.type=json_objectが含まれる", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(makeSuccessResponse('{"key":"value"}')), { status: 200 }),
    );
    const provider = new OpenAICompatibleProvider(defaultConfig);
    await provider.complete({
      messages: [{ role: "user", content: "Hi" }],
      responseFormat: "json",
    });
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  // 8. complete(): モデル不存在(404)時にLLMProviderError（errorCode: "model_not_found"）
  it("complete: 404のときerrorCode=model_not_foundのLLMProviderErrorを投げる", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404 }),
    );
    const provider = new OpenAICompatibleProvider({ ...defaultConfig, maxRetries: 0 });
    const err = await provider
      .complete({ messages: [{ role: "user", content: "Hi" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(LLMProviderError);
    expect((err as LLMProviderError).errorCode).toBe("model_not_found");
  });

  // 9. apiKeyがAuthorizationヘッダーに含まれる
  it("complete: apiKeyがAuthorizationヘッダーに含まれる", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(makeSuccessResponse()), { status: 200 }),
    );
    const provider = new OpenAICompatibleProvider(defaultConfig);
    await provider.complete({ messages: [{ role: "user", content: "Hi" }] });
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-api-key");
  });

  // 10. 環境変数KNOWLEDGINE_LLM_API_KEYからの読み取り
  it("complete: 環境変数KNOWLEDGINE_LLM_API_KEYからapiKeyを読み取る", async () => {
    process.env["KNOWLEDGINE_LLM_API_KEY"] = "env-api-key";
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(makeSuccessResponse()), { status: 200 }),
    );
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://api.example.com",
      model: "gpt-4o",
      maxRetries: 0,
    });
    await provider.complete({ messages: [{ role: "user", content: "Hi" }] });
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer env-api-key");
  });

  // 11. apiKey未設定時はAuthorizationヘッダーなし
  it("complete: apiKey未設定時はAuthorizationヘッダーなし", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(makeSuccessResponse()), { status: 200 }),
    );
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://api.example.com",
      model: "gpt-4o",
      maxRetries: 0,
    });
    await provider.complete({ messages: [{ role: "user", content: "Hi" }] });
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });
});
