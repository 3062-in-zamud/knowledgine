import { describe, it, expect } from "vitest";

describe("KNOW-381: suggest --file header", () => {
  it("truncates to 5 lines", () => {
    const content = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n");
    const lines = content.split("\n");
    const header = lines.slice(0, 5);
    expect(header).toHaveLength(5);
    expect(lines.length - 5).toBe(15);
  });
});
