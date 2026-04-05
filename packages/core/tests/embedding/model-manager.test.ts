import { describe, it, expect, afterEach } from "vitest";
import {
  ModelManager,
  MODEL_REGISTRY,
  DEFAULT_MODEL_NAME,
  LEGACY_MODEL_NAME,
} from "../../src/embedding/model-manager.js";
import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("MODEL_REGISTRY", () => {
  it("should contain all-MiniLM-L6-v2", () => {
    expect(MODEL_REGISTRY["all-MiniLM-L6-v2"]).toBeDefined();
  });

  it("should contain multilingual-e5-small", () => {
    expect(MODEL_REGISTRY["multilingual-e5-small"]).toBeDefined();
  });

  it("all-MiniLM-L6-v2 should have bert family", () => {
    expect(MODEL_REGISTRY["all-MiniLM-L6-v2"].family).toBe("bert");
  });

  it("multilingual-e5-small should have e5 family", () => {
    expect(MODEL_REGISTRY["multilingual-e5-small"].family).toBe("e5");
  });

  it("both models should have 384 dimensions", () => {
    expect(MODEL_REGISTRY["all-MiniLM-L6-v2"].dimensions).toBe(384);
    expect(MODEL_REGISTRY["multilingual-e5-small"].dimensions).toBe(384);
  });

  it("multilingual-e5-small should have maxLength 512", () => {
    expect(MODEL_REGISTRY["multilingual-e5-small"].maxLength).toBe(512);
  });

  it("all-MiniLM-L6-v2 should have maxLength 128", () => {
    expect(MODEL_REGISTRY["all-MiniLM-L6-v2"].maxLength).toBe(128);
  });

  it("multilingual-e5-small onnxPath should be a string (not a function)", () => {
    const onnxPath = MODEL_REGISTRY["multilingual-e5-small"].onnxPath;
    expect(typeof onnxPath).toBe("string");
    expect(onnxPath).toContain("model_quantized.onnx");
  });

  it("all-MiniLM-L6-v2 onnxPath should be a function (platform-dependent)", () => {
    const onnxPath = MODEL_REGISTRY["all-MiniLM-L6-v2"].onnxPath;
    expect(typeof onnxPath).toBe("function");
    const resolved = (onnxPath as () => string)();
    expect(resolved).toMatch(/\.onnx$/);
  });
});

describe("DEFAULT_MODEL_NAME and LEGACY_MODEL_NAME", () => {
  it("DEFAULT_MODEL_NAME should be multilingual-e5-small", () => {
    expect(DEFAULT_MODEL_NAME).toBe("multilingual-e5-small");
  });

  it("LEGACY_MODEL_NAME should be all-MiniLM-L6-v2", () => {
    expect(LEGACY_MODEL_NAME).toBe("all-MiniLM-L6-v2");
  });
});

describe("ModelManager.getModelConfig", () => {
  const modelsDir = join(__dirname, "..", "..", "models");
  const manager = new ModelManager(modelsDir);

  it("should return config for known model", () => {
    const config = manager.getModelConfig("all-MiniLM-L6-v2");
    expect(config).toBeDefined();
    expect(config?.family).toBe("bert");
  });

  it("should return config for multilingual-e5-small", () => {
    const config = manager.getModelConfig("multilingual-e5-small");
    expect(config).toBeDefined();
    expect(config?.family).toBe("e5");
    expect(config?.dimensions).toBe(384);
  });

  it("should return undefined for unknown model", () => {
    const config = manager.getModelConfig("nonexistent-model");
    expect(config).toBeUndefined();
  });

  it("should use DEFAULT_MODEL_NAME when no argument given", () => {
    const config = manager.getModelConfig();
    expect(config).toBeDefined();
    expect(config?.family).toBe("e5");
  });
});

describe("ModelManager path methods", () => {
  const modelsDir = "/test/models";
  const manager = new ModelManager(modelsDir);

  it("getModelDir should use model name as subdirectory", () => {
    expect(manager.getModelDir("multilingual-e5-small")).toBe(`${modelsDir}/multilingual-e5-small`);
  });

  it("getModelPath should point to model.onnx", () => {
    expect(manager.getModelPath("multilingual-e5-small")).toBe(
      `${modelsDir}/multilingual-e5-small/model.onnx`,
    );
  });

  it("getTokenizerPath should point to tokenizer.json", () => {
    expect(manager.getTokenizerPath("multilingual-e5-small")).toBe(
      `${modelsDir}/multilingual-e5-small/tokenizer.json`,
    );
  });

  it("should use DEFAULT_MODEL_NAME when no model specified", () => {
    expect(manager.getModelDir()).toContain(DEFAULT_MODEL_NAME);
  });
});

describe("ModelManager.resolveDefaultModelsDir", () => {
  const originalEnv = process.env.KNOWLEDGINE_MODELS_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.KNOWLEDGINE_MODELS_DIR;
    } else {
      process.env.KNOWLEDGINE_MODELS_DIR = originalEnv;
    }
  });

  it("should use explicit modelsDir when provided", () => {
    const manager = new ModelManager("/custom/models");
    expect(manager.getModelDir(DEFAULT_MODEL_NAME)).toBe(
      join("/custom/models", DEFAULT_MODEL_NAME),
    );
  });

  it("should use KNOWLEDGINE_MODELS_DIR env var when set", () => {
    process.env.KNOWLEDGINE_MODELS_DIR = "/env/override/models";
    const resolved = ModelManager.resolveDefaultModelsDir();
    expect(resolved).toBe("/env/override/models");
  });

  it("should resolve to a defined path when no env var is set", () => {
    delete process.env.KNOWLEDGINE_MODELS_DIR;
    const resolved = ModelManager.resolveDefaultModelsDir();
    // Should be either pkg-relative (if model exists) or ~/.knowledgine/models/
    expect(typeof resolved).toBe("string");
    expect(resolved.length).toBeGreaterThan(0);
    // Must end with "models" in the path
    expect(resolved).toMatch(/models$/);
  });
});
