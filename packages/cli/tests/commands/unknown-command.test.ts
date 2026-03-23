import { describe, it, expect } from "vitest";
import {
  buildUnknownCommandHelp,
  createOutputErrorHandler,
} from "../../src/lib/unknown-command-handler.js";

describe("unknown command handling", () => {
  describe("buildUnknownCommandHelp", () => {
    it("should list available commands sorted alphabetically", () => {
      const result = buildUnknownCommandHelp(["search", "init", "capture", "status"]);
      expect(result).toContain("Available commands: capture, init, search, status");
    });

    it("should include help instruction", () => {
      const result = buildUnknownCommandHelp(["init"]);
      expect(result).toContain("Run 'knowledgine --help' for usage information.");
    });

    it("should include core CLI commands", () => {
      const coreCommands = ["init", "search", "capture", "status", "start", "setup"];
      const result = buildUnknownCommandHelp(coreCommands);
      expect(result).toContain("init");
      expect(result).toContain("search");
      expect(result).toContain("capture");
    });

    it("should not mutate the input array when sorting", () => {
      const commands = ["search", "init", "capture"];
      buildUnknownCommandHelp(commands);
      expect(commands).toEqual(["search", "init", "capture"]);
    });
  });

  describe("createOutputErrorHandler", () => {
    it("should always write the original error message", () => {
      const handler = createOutputErrorHandler(() => ["init", "search"]);
      const written: string[] = [];
      handler("error: some error message\n", (s) => written.push(s));
      expect(written[0]).toBe("error: some error message\n");
    });

    it("should append available commands when error contains 'unknown command'", () => {
      const handler = createOutputErrorHandler(() => ["init", "search", "capture"]);
      const written: string[] = [];
      handler("error: unknown command 'xyz'\n", (s) => written.push(s));
      const output = written.join("");
      expect(output).toContain("Available commands");
      expect(output).toContain("init");
      expect(output).toContain("search");
      expect(output).toContain("capture");
    });

    it("should not append available commands for non-unknown-command errors", () => {
      const handler = createOutputErrorHandler(() => ["init", "search"]);
      const written: string[] = [];
      handler("error: missing required option '--path'\n", (s) => written.push(s));
      const output = written.join("");
      expect(output).not.toContain("Available commands");
    });

    it("should call getCommandNames lazily when 'unknown command' is encountered", () => {
      let callCount = 0;
      const handler = createOutputErrorHandler(() => {
        callCount++;
        return ["init"];
      });
      const written: string[] = [];

      // Non-unknown-command error: getCommandNames should not be called
      handler("error: missing option\n", (s) => written.push(s));
      expect(callCount).toBe(0);

      // Unknown command error: getCommandNames should be called
      handler("error: unknown command 'xyz'\n", (s) => written.push(s));
      expect(callCount).toBe(1);
    });
  });
});
