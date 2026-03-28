import { KnowledgeRepository, GraphRepository, IncrementalExtractor } from "@knowledgine/core";

export interface PostIngestSummary {
  totalNotes: number;
  processedNotes: number;
  totalEntities: number;
  totalRelations: number;
  totalPatterns: number;
  errors: number;
}

/**
 * 全ノートに対してパターン抽出、エンティティ抽出、関係推論をバッチ実行する。
 * init コマンドから ingest パイプライン経由でノートが保存された後に呼ばれる。
 *
 * @deprecated 新規コードは IncrementalExtractor を直接使用してください
 */
export async function postIngestProcessing(
  repository: KnowledgeRepository,
  graphRepository: GraphRepository,
  onProgress?: (current: number, total: number) => void,
): Promise<PostIngestSummary> {
  const allNoteIds = repository.getAllNoteIds();
  const totalNotes = allNoteIds.length;

  const incrementalExtractor = new IncrementalExtractor(repository, graphRepository);
  const summary = await incrementalExtractor.process(allNoteIds, onProgress);

  return {
    totalNotes,
    processedNotes: summary.processedNotes,
    totalEntities: summary.totalEntities,
    totalRelations: summary.totalRelations,
    totalPatterns: summary.totalPatterns,
    errors: summary.errors,
  };
}
