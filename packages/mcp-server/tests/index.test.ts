import { describe, it, expect } from "vitest";
import { createServer } from "../src/index.js";

describe("mcp-server", () => {
  it("creates a server with name containing basePath", () => {
    const server = createServer({ basePath: "/test/path" });
    expect(server.name).toContain("/test/path");
  });
});
