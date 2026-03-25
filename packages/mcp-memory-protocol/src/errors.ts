// Error codes defined in MCP Memory Protocol Specification Section 7

export type MemoryErrorCode =
  | "MEMORY_NOT_FOUND"
  | "INVALID_CONTENT"
  | "INVALID_LAYER"
  | "INVALID_PARAMETER"
  | "VERSION_CONFLICT"
  | "STORAGE_ERROR"
  | "CAPABILITY_NOT_SUPPORTED";

export class MemoryProtocolError extends Error {
  constructor(
    public readonly code: MemoryErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "MemoryProtocolError";
  }
}

export function memoryNotFound(id: string): MemoryProtocolError {
  return new MemoryProtocolError("MEMORY_NOT_FOUND", `Memory entry with id='${id}' does not exist`);
}

export function invalidContent(): MemoryProtocolError {
  return new MemoryProtocolError("INVALID_CONTENT", "content must be a non-empty string");
}

export function invalidLayer(value: string): MemoryProtocolError {
  return new MemoryProtocolError(
    "INVALID_LAYER",
    `'${value}' is not a valid layer. Must be one of: episodic, semantic, procedural`,
  );
}

export function invalidParameter(field: string, detail: string): MemoryProtocolError {
  return new MemoryProtocolError("INVALID_PARAMETER", `${field}: ${detail}`);
}

export function versionConflict(id: string): MemoryProtocolError {
  return new MemoryProtocolError("VERSION_CONFLICT", `Concurrent update conflict for id='${id}'`);
}

export function storageError(detail: string): MemoryProtocolError {
  return new MemoryProtocolError("STORAGE_ERROR", detail);
}

export function capabilityNotSupported(capability: string): MemoryProtocolError {
  return new MemoryProtocolError(
    "CAPABILITY_NOT_SUPPORTED",
    `Capability '${capability}' is not supported by this server`,
  );
}
