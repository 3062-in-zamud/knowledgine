import { z } from "zod";

export const MemoryLayerSchema = z.enum(["episodic", "semantic", "procedural"]);

export const MemoryMetadataSchema = z
  .object({
    source: z.string().nullable().optional(),
    project: z.string().nullable().optional(),
    sessionId: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })
  .passthrough();

export const MemoryStoreRequestSchema = z.object({
  content: z.string().min(1),
  layer: MemoryLayerSchema.optional(),
  metadata: MemoryMetadataSchema.optional(),
  tags: z.array(z.string()).optional(),
  ttl: z.number().int().positive().optional(),
});

export const RecallFilterSchema = z.object({
  layer: MemoryLayerSchema.optional(),
  tags: z.array(z.string()).optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  memoryIds: z.array(z.string()).optional(),
});

export const MemoryRecallRequestSchema = z.object({
  query: z.string().optional(),
  filter: RecallFilterSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  asOf: z.string().optional(),
  includeVersionHistory: z.boolean().optional(),
});

export const MemoryUpdateRequestSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1).optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: MemoryMetadataSchema.partial().optional(),
  createVersion: z.boolean().optional(),
});

export const MemoryForgetRequestSchema = z.object({
  id: z.string().min(1),
  reason: z.string().optional(),
  hard: z.boolean().optional(),
});
