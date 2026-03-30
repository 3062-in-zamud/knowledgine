import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export interface ModelConfig {
  hfRepo: string;
  dimensions: number;
  maxLength: number;
  family: "bert" | "e5";
  onnxPath: string | (() => string);
  files: string[];
}

const HF_BASE_MINILM = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main";

/**
 * Select the best quantized ONNX model for the current platform (all-MiniLM-L6-v2).
 */
function selectOnnxModel(): string {
  const arch = process.arch;
  if (arch === "arm64") {
    return "onnx/model_qint8_arm64.onnx";
  }
  return "onnx/model_quint8_avx2.onnx";
}

export const MODEL_REGISTRY: Record<string, ModelConfig> = {
  "all-MiniLM-L6-v2": {
    hfRepo: "sentence-transformers/all-MiniLM-L6-v2",
    dimensions: 384,
    maxLength: 128,
    family: "bert",
    onnxPath: selectOnnxModel,
    files: ["tokenizer.json", "config.json"],
  },
  "multilingual-e5-small": {
    hfRepo: "Xenova/multilingual-e5-small",
    dimensions: 384,
    maxLength: 512,
    family: "e5",
    onnxPath: "onnx/model_quantized.onnx",
    files: ["tokenizer.json", "config.json"],
  },
};

export const DEFAULT_MODEL_NAME = "multilingual-e5-small";
export const LEGACY_MODEL_NAME = "all-MiniLM-L6-v2";

export class ModelManager {
  private modelsDir: string;

  constructor(modelsDir?: string) {
    if (modelsDir) {
      this.modelsDir = modelsDir;
    } else {
      // Resolve models/ relative to the package root (one level above src/embedding/)
      const currentDir = dirname(fileURLToPath(import.meta.url));
      // In dist: dist/embedding/ -> package root
      // In src: src/embedding/ -> package root
      this.modelsDir = join(currentDir, "..", "..", "models");
    }
  }

  getModelDir(modelName: string = DEFAULT_MODEL_NAME): string {
    return join(this.modelsDir, modelName);
  }

  getModelPath(modelName: string = DEFAULT_MODEL_NAME): string {
    return join(this.getModelDir(modelName), "model.onnx");
  }

  getTokenizerPath(modelName: string = DEFAULT_MODEL_NAME): string {
    return join(this.getModelDir(modelName), "tokenizer.json");
  }

  isModelAvailable(modelName: string = DEFAULT_MODEL_NAME): boolean {
    return existsSync(this.getModelPath(modelName)) && existsSync(this.getTokenizerPath(modelName));
  }

  getModelConfig(modelName: string = DEFAULT_MODEL_NAME): ModelConfig | undefined {
    return MODEL_REGISTRY[modelName];
  }
}

// Re-export for backward compat with code that uses selectOnnxModel from this module's HF_BASE context
export { HF_BASE_MINILM };
