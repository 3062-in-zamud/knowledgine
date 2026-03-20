export interface EmbeddingProvider {
  /** テキストを埋め込みベクトルに変換する */
  embed(text: string): Promise<Float32Array>;
  /** 複数テキストをバッチ処理する */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  /** 埋め込みの次元数を返す */
  getDimensions(): number;
}
