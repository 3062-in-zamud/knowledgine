import type { InferenceSession, Tensor } from "onnxruntime-node";
import type { EmbeddingProvider } from "./embedding-provider.js";
import { WordPieceTokenizer } from "./tokenizer.js";
import { ModelManager, DEFAULT_MODEL_NAME } from "./model-manager.js";
import { EmbeddingNotAvailableError, EmbeddingError } from "../errors.js";

const DIMENSIONS = 384;

export class OnnxEmbeddingProvider implements EmbeddingProvider {
  private session: InferenceSession | null = null;
  private tokenizer: WordPieceTokenizer | null = null;
  private modelName: string;
  private modelManager: ModelManager;
  private ort: typeof import("onnxruntime-node") | null = null;

  constructor(modelName: string = DEFAULT_MODEL_NAME, modelManager?: ModelManager) {
    this.modelName = modelName;
    this.modelManager = modelManager ?? new ModelManager();
  }

  private async getSession(): Promise<InferenceSession> {
    if (this.session) return this.session;

    if (!this.modelManager.isModelAvailable(this.modelName)) {
      throw new EmbeddingNotAvailableError(
        `Model "${this.modelName}" not found. Run 'knowledgine init' to download the model automatically.`,
      );
    }

    try {
      if (!this.ort) {
        this.ort = await import("onnxruntime-node");
      }
      this.session = await this.ort.InferenceSession.create(
        this.modelManager.getModelPath(this.modelName),
        { executionProviders: ["cpu"] },
      );
      return this.session;
    } catch (error) {
      throw new EmbeddingError(
        `Failed to load ONNX model "${this.modelName}"`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private getTokenizer(): WordPieceTokenizer {
    if (this.tokenizer) return this.tokenizer;
    if (!this.modelManager.isModelAvailable(this.modelName)) {
      throw new EmbeddingNotAvailableError(
        `Model "${this.modelName}" not found. Run 'knowledgine init' to download the model automatically.`,
      );
    }
    this.tokenizer = new WordPieceTokenizer(this.modelManager.getTokenizerPath(this.modelName));
    return this.tokenizer;
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const session = await this.getSession();
    const tokenizer = this.getTokenizer();

    try {
      if (!this.ort) {
        this.ort = await import("onnxruntime-node");
      }
      const ort = this.ort;
      const results: Float32Array[] = [];

      for (const text of texts) {
        const encoded = tokenizer.encode(text);
        const seqLen = encoded.inputIds.length;

        const inputIds = new ort.Tensor("int64", BigInt64Array.from(encoded.inputIds.map(BigInt)), [
          1,
          seqLen,
        ]);
        const attentionMask = new ort.Tensor(
          "int64",
          BigInt64Array.from(encoded.attentionMask.map(BigInt)),
          [1, seqLen],
        );
        const tokenTypeIds = new ort.Tensor(
          "int64",
          BigInt64Array.from(encoded.tokenTypeIds.map(BigInt)),
          [1, seqLen],
        );

        const feeds: Record<string, Tensor> = {
          input_ids: inputIds,
          attention_mask: attentionMask,
          token_type_ids: tokenTypeIds,
        };
        const output = await session.run(feeds);

        // Mean pooling over token embeddings (last hidden state)
        const outputKey = Object.keys(output)[0];
        const lastHiddenState = output["last_hidden_state"] ?? output[outputKey];
        const data = lastHiddenState.data as Float32Array;
        const embedding = this.meanPool(data, encoded.attentionMask, seqLen, DIMENSIONS);
        results.push(this.normalize(embedding));
      }

      return results;
    } catch (error) {
      if (error instanceof EmbeddingNotAvailableError || error instanceof EmbeddingError) {
        throw error;
      }
      throw new EmbeddingError(
        "ONNX inference failed",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  getDimensions(): number {
    return DIMENSIONS;
  }

  async close(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
  }

  private meanPool(
    data: Float32Array,
    attentionMask: number[],
    seqLen: number,
    hiddenSize: number,
  ): Float32Array {
    const pooled = new Float32Array(hiddenSize);
    let count = 0;

    for (let i = 0; i < seqLen; i++) {
      if (attentionMask[i] === 0) continue;
      count++;
      for (let j = 0; j < hiddenSize; j++) {
        pooled[j] += data[i * hiddenSize + j];
      }
    }

    if (count > 0) {
      for (let j = 0; j < hiddenSize; j++) {
        pooled[j] /= count;
      }
    }

    return pooled;
  }

  private normalize(vec: Float32Array): Float32Array {
    let norm = 0;
    for (const v of vec) {
      norm += v * v;
    }
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    const result = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      result[i] = vec[i] / norm;
    }
    return result;
  }
}
