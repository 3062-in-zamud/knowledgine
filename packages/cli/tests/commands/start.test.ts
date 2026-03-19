import { describe, it, expect } from "vitest";
import { startCommand } from "../../src/commands/start.js";

describe("start command", () => {
  it("should export startCommand function", () => {
    expect(typeof startCommand).toBe("function");
  });
});
