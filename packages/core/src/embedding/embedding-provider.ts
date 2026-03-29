export interface EmbeddingProvider {
  /** テキストを埋め込みベクトルに変換する（document用） */
  embed(text: string): Promise<Float32Array>;
  /**
   * クエリテキストを埋め込みベクトルに変換する。
   * E5モデルでは "query: " プレフィックスを付与する。
   * BERT系モデルでは embed() と同一動作。
   */
  embedQuery(text: string): Promise<Float32Array>;
  /** 複数テキストをバッチ処理する（document用） */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  /** 埋め込みの次元数を返す */
  getDimensions(): number;
}
