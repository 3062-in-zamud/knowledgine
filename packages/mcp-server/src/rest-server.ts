import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { KnowledgeService, KnowledgeRepository, GraphRepository } from "@knowledgine/core";
import { IncrementalExtractor, GraphRepository as GraphRepositoryImpl } from "@knowledgine/core";
import type Database from "better-sqlite3";

export interface CaptureOptions {
  db: Database.Database;
  repository: KnowledgeRepository;
  graphRepository?: GraphRepository;
  authToken: string;
}

const captureSchema = z.object({
  content: z.string().min(1).max(100000),
  title: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  source: z.string().max(100).optional(),
});

function createAuthMiddleware(token: string): (c: Context, next: Next) => Promise<Response | void> {
  return async (c, next) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ error: "Authorization required" }, 401);
    }
    const provided = Buffer.from(auth.slice(7));
    const expected = Buffer.from(token);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return c.json({ error: "Invalid token" }, 401);
    }
    await next();
  };
}

export function createRestApp(
  service: KnowledgeService,
  version: string,
  capture?: CaptureOptions,
): Hono {
  const app = new Hono();

  // CORS: localhostのみ許可
  app.use("*", cors());

  // GET /health
  app.get("/health", (c) => {
    const stats = service.getStats(); // sync
    return c.json({ ok: true, version, notes: stats.totalNotes });
  });

  // GET /search?q=...&mode=keyword&limit=20
  app.get("/search", async (c) => {
    const q = c.req.query("q");
    if (!q) return c.json({ error: "q parameter is required" }, 400);
    const mode = c.req.query("mode") ?? "keyword";
    const limit = parseInt(c.req.query("limit") ?? "20", 10);
    if (isNaN(limit) || limit < 1) return c.json({ error: "Invalid limit" }, 400);
    const start = Date.now();
    const result = await service.search({
      query: q,
      limit,
      mode: mode as "keyword" | "semantic" | "hybrid",
    }); // async
    return c.json({ ...result, took_ms: Date.now() - start });
  });

  // GET /stats
  app.get("/stats", (c) => {
    return c.json(service.getStats()); // sync
  });

  // GET /entities?q=...&limit=20
  app.get("/entities", (c) => {
    const q = c.req.query("q") ?? "";
    const limit = parseInt(c.req.query("limit") ?? "20", 10);
    return c.json(service.searchEntities({ query: q, limit })); // sync
  });

  // GET /entities/:name/graph
  app.get("/entities/:name/graph", (c) => {
    const name = decodeURIComponent(c.req.param("name"));
    const result = service.getEntityGraph({ entityName: name }); // sync
    if (!result) return c.json({ error: "Entity not found" }, 404);
    return c.json(result);
  });

  // GET /related/:noteId?limit=5
  app.get("/related/:noteId", async (c) => {
    const noteId = parseInt(c.req.param("noteId"), 10);
    if (isNaN(noteId)) return c.json({ error: "Invalid noteId" }, 400);
    const limit = parseInt(c.req.query("limit") ?? "5", 10);
    const result = await service.findRelated({ noteId, limit }); // async
    return c.json(result);
  });

  // POST /capture (requires auth + capture options)
  if (capture) {
    app.post("/capture", createAuthMiddleware(capture.authToken), async (c) => {
      const raw = await c.req.json().catch(() => null);
      const parsed = captureSchema.safeParse(raw);
      if (!parsed.success) {
        return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
      }
      const input = parsed.data;

      const { EventWriter, sanitizeContent } = await import("@knowledgine/ingest");
      const writer = new EventWriter(capture.db, capture.repository);
      const title = input.title || input.content.slice(0, 50).replace(/\n/g, " ").trim();
      const sourceUri = input.source ? `capture://${input.source}` : "capture://rest";
      const event = {
        sourceUri,
        eventType: "capture" as const,
        title,
        content: sanitizeContent(input.content),
        timestamp: new Date(),
        metadata: {
          sourcePlugin: "capture",
          sourceId: `capture-${Date.now()}`,
          tags: input.tags,
        },
      };
      const result = writer.writeEvent(event);

      const extractor = new IncrementalExtractor(
        capture.repository,
        capture.graphRepository ?? new GraphRepositoryImpl(capture.db),
      );
      await extractor.process([result.noteId]);

      return c.json(
        {
          id: result.id,
          title,
          tags: input.tags ?? [],
          sourceUri,
        },
        201,
      );
    });
  }

  return app;
}
