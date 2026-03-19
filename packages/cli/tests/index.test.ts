import { describe, it, expect } from "vitest";
import { VERSION } from "@knowledgine/core";
import { initCommand } from "../src/commands/init.js";
import { startCommand } from "../src/commands/start.js";

describe("cli", () => {
  it("should export initCommand", () => {
    expect(typeof initCommand).toBe("function");
  });

  it("should export startCommand", () => {
    expect(typeof startCommand).toBe("function");
  });

  it("VERSION should be defined", () => {
    expect(VERSION).toBeDefined();
    expect(typeof VERSION).toBe("string");
  });
});
