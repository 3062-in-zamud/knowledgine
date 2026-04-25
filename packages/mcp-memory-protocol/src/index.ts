// Main entry — types, schemas, errors, and the MemoryProvider interface.
// The conformance test kit is exported separately under `./conformance` to
// keep the runtime cost of the main entry minimal for production providers.

export type {
  MemoryLayer,
  MemoryMetadata,
  MemoryStoreRequest,
  MemoryStoreResponse,
  RecallFilter,
  MemoryRecallRequest,
  RecalledMemory,
  MemoryRecallResponse,
  MemoryUpdateRequest,
  MemoryUpdateResponse,
  MemoryForgetRequest,
  MemoryForgetResponse,
  MemoryEntry,
  VersionInfo,
  MemoryProviderCapabilities,
} from "./types.js";

export type { MemoryProvider } from "./provider.js";

export {
  MemoryProtocolError,
  memoryNotFound,
  invalidContent,
  invalidLayer,
  invalidParameter,
  versionConflict,
  storageError,
  capabilityNotSupported,
} from "./errors.js";
export type { MemoryErrorCode } from "./errors.js";

export {
  MemoryLayerSchema,
  MemoryMetadataSchema,
  MemoryStoreRequestSchema,
  RecallFilterSchema,
  MemoryRecallRequestSchema,
  MemoryUpdateRequestSchema,
  MemoryForgetRequestSchema,
} from "./schema.js";
