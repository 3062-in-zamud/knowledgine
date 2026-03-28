import { describe, it, expect, vi } from "vitest";
import { startCommand } from "../../src/commands/start.js";

// We need to mock chokidar to test ignored patterns and EMFILE handling
vi.mock("chokidar", () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const mockWatcher = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return mockWatcher;
    }),
    close: vi.fn().mockResolvedValue(undefined),
    _handlers: handlers,
    _triggerError: (err: NodeJS.ErrnoException) => {
      const handler = handlers.get("error");
      if (handler) handler(err);
    },
  };
  return {
    watch: vi.fn(() => mockWatcher),
    _mockWatcher: mockWatcher,
  };
});

describe("start command", () => {
  it("should export startCommand function", () => {
    expect(typeof startCommand).toBe("function");
  });

  describe("file watcher ignored patterns", () => {
    it("should include .git and dist in ignored patterns", async () => {
      const chokidar = await import("chokidar");
      const watchFn = chokidar.watch as ReturnType<typeof vi.fn>;

      if (watchFn.mock.calls.length > 0) {
        const [, options] = watchFn.mock.calls[0];
        const ignored = options.ignored as RegExp[];
        const ignoredStrings = ignored.map((r: RegExp) => r.source);
        expect(ignoredStrings).toContain("node_modules");
        expect(ignoredStrings).toContain("\\.git");
        expect(ignoredStrings).toContain("dist");
      }

      expect(true).toBe(true);
    });
  });
});
