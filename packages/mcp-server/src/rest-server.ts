import { Hono } from "hono";
import { cors } from "hono/cors";
import type { KnowledgeService } from "@knowledgine/core";

export function createRestApp(service: KnowledgeService, version: string): Hono {
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

  return app;
}
