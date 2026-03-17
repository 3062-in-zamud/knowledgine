import { describe, it, expect } from "vitest";
import { run } from "../src/index.js";
import { VERSION } from "@knowledgine/core";

describe("cli", () => {
  it("--version returns the version string", () => {
    const result = run(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(VERSION);
  });

  it("--help returns help text", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Usage:");
  });
});
