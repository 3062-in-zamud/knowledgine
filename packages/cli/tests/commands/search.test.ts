import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatSearchResults } from "../../src/commands/search.js";

describe("search command", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let output: string[];

  beforeEach(() => {
    output = [];
    stderrSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe("formatSearchResults", () => {
    it("should display results with scores and file paths", () => {
      const results = [
        {
          note: { file_path: "auth-debugging.md", title: "Authentication Debugging" },
          score: 0.95,
          matchReason: ["keyword match"],
        },
        {
          note: { file_path: "api-design.md", title: "API Design Decisions" },
          score: 0.82,
          matchReason: ["keyword match"],
        },
      ];

      formatSearchResults("auth", results as never);

      const text = output.join("\n");
      expect(text).toContain('Results for "auth" (2 matches)');
      expect(text).toContain("[0.95] auth-debugging.md");
      expect(text).toContain("Authentication Debugging");
      expect(text).toContain("[0.82] api-design.md");
      expect(text).toContain("API Design Decisions");
    });

    it("should display numbered results", () => {
      const results = [
        {
          note: { file_path: "a.md", title: "A" },
          score: 1.0,
          matchReason: [],
        },
        {
          note: { file_path: "b.md", title: "B" },
          score: 0.5,
          matchReason: [],
        },
      ];

      formatSearchResults("test", results as never);

      const text = output.join("\n");
      expect(text).toContain("1. [1.00] a.md");
      expect(text).toContain("2. [0.50] b.md");
    });

    it("should display no results message when empty", () => {
      formatSearchResults("nonexistent", [] as never);

      const text = output.join("\n");
      expect(text).toContain('No results for "nonexistent"');
    });
  });
});
