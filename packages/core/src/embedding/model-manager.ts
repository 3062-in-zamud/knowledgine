import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export const DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2";

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
    return (
      existsSync(this.getModelPath(modelName)) && existsSync(this.getTokenizerPath(modelName))
    );
  }
}
