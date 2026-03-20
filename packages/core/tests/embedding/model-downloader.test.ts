import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { PassThrough } from "stream";
import { ModelManager } from "../../src/embedding/model-manager.js";
import { downloadModel, MODEL_FILES } from "../../src/embedding/model-downloader.js";

// We mock the actual HTTP calls to avoid network dependency in tests
vi.mock("https", () => {
  return {
    get: vi.fn((url: string, callback: (res: PassThrough & { statusCode: number; headers: Record<string, string> }) => void) => {
      const response = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };

      // Simulate redirect for HuggingFace CDN
      if (url.includes("redirect-test")) {
        response.statusCode = 302;
        response.headers = { location: url.replace("redirect-test", "final") };
        setTimeout(() => callback(response), 0);
        const req = new PassThrough();
        (req as PassThrough & { destroy: ReturnType<typeof vi.fn> }).destroy = vi.fn();
        return req;
      }

      // Simulate HTTP error
      if (url.includes("error-test")) {
        response.statusCode = 404;
        response.headers = {};
        setTimeout(() => callback(response), 0);
        const req = new PassThrough();
        (req as PassThrough & { destroy: ReturnType<typeof vi.fn> }).destroy = vi.fn();
        return req;
      }

      // Simulate successful download
      response.statusCode = 200;
      response.headers = { "content-length": "100" };
      setTimeout(() => {
        callback(response);
        response.write(Buffer.from("test-content-data"));
        response.end();
      }, 0);

      const req = new PassThrough();
      (req as PassThrough & { destroy: ReturnType<typeof vi.fn> }).destroy = vi.fn();
      return req;
    }),
  };
});

describe("model-downloader", () => {
  let testDir: string;
  let modelManager: ModelManager;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-dl-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    modelManager = new ModelManager(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should export MODEL_FILES with correct structure", () => {
    expect(MODEL_FILES).toHaveLength(3);
    expect(MODEL_FILES.map((f) => f.dest)).toEqual(["tokenizer.json", "config.json", "model.onnx"]);
  });

  it("should skip existing valid files", async () => {
    // Pre-create all model files
    const modelDir = modelManager.getModelDir();
    mkdirSync(modelDir, { recursive: true });
    for (const file of MODEL_FILES) {
      writeFileSync(join(modelDir, file.dest), "existing-content");
    }

    const result = await downloadModel(modelManager);

    expect(result.skipped).toHaveLength(3);
    expect(result.downloaded).toHaveLength(0);
  });

  it("should treat 0-byte files as corrupt and re-download", async () => {
    const modelDir = modelManager.getModelDir();
    mkdirSync(modelDir, { recursive: true });

    // Create a 0-byte file
    writeFileSync(join(modelDir, "tokenizer.json"), "");
    // Create valid files for others
    writeFileSync(join(modelDir, "config.json"), "valid");
    writeFileSync(join(modelDir, "model.onnx"), "valid");

    const result = await downloadModel(modelManager);

    // tokenizer.json should be re-downloaded (0-byte)
    expect(result.downloaded).toContain("tokenizer.json");
    expect(result.skipped).toContain("config.json");
    expect(result.skipped).toContain("model.onnx");
  });

  it("should call onProgress during download", async () => {
    const progressCalls: Array<{ file: string; downloaded: number }> = [];
    const completeCalls: string[] = [];

    await downloadModel(modelManager, {
      onProgress: (p) => progressCalls.push({ file: p.file, downloaded: p.downloaded }),
      onFileComplete: (f) => completeCalls.push(f),
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(completeCalls).toHaveLength(3);
  });

  it("should create model directory if it does not exist", async () => {
    const modelDir = modelManager.getModelDir();
    expect(existsSync(modelDir)).toBe(false);

    await downloadModel(modelManager);

    expect(existsSync(modelDir)).toBe(true);
  });
});
