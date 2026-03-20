/**
 * Minimal type declarations for onnxruntime-node.
 * The package does not ship its own .d.ts files in v1.20.x.
 */
declare module "onnxruntime-node" {
  export interface TensorOptions {
    dims?: readonly number[];
  }

  export class Tensor {
    readonly data: Float32Array | BigInt64Array | Int32Array | Uint8Array;
    readonly dims: readonly number[];
    readonly type: string;
    constructor(
      type: string,
      data: BigInt64Array | Float32Array | Int32Array | Uint8Array,
      dims?: readonly number[],
    );
  }

  export interface RunOptions {
    logSeverityLevel?: number;
  }

  export interface InferenceSession {
    run(feeds: Record<string, Tensor>, options?: RunOptions): Promise<Record<string, Tensor>>;
    release(): Promise<void>;
    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
  }

  export namespace InferenceSession {
    interface SessionOptions {
      executionProviders?: string[];
      logSeverityLevel?: number;
    }
    function create(modelPath: string, options?: SessionOptions): Promise<InferenceSession>;
  }
}
