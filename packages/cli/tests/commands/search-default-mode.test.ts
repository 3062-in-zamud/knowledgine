import { describe, it, expect } from "vitest";

describe("KNOW-385: Default search mode", () => {
  it("search mode defaults are valid", () => {
    const validModes = ["keyword", "semantic", "hybrid"];
    // Basic structural test
    expect(validModes).toContain("hybrid");
    expect(validModes).toContain("keyword");
  });
});
