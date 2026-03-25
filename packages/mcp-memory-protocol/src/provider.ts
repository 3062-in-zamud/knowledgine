import type {
  MemoryStoreRequest,
  MemoryStoreResponse,
  MemoryRecallRequest,
  MemoryRecallResponse,
  MemoryUpdateRequest,
  MemoryUpdateResponse,
  MemoryForgetRequest,
  MemoryForgetResponse,
  MemoryProviderCapabilities,
} from "./types.js";

export interface MemoryProvider {
  store(request: MemoryStoreRequest): Promise<MemoryStoreResponse>;
  recall(request: MemoryRecallRequest): Promise<MemoryRecallResponse>;
  update(request: MemoryUpdateRequest): Promise<MemoryUpdateResponse>;
  forget(request: MemoryForgetRequest): Promise<MemoryForgetResponse>;
  capabilities(): MemoryProviderCapabilities;
}
