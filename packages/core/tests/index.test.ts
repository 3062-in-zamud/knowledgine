import { describe, it, expect } from "vitest";
import { VERSION } from "../src/index.js";

describe("core", () => {
  it("exports a valid semver VERSION string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
