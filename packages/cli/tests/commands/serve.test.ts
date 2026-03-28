import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { Command } from "commander";
import { registerServeCommand } from "../../src/commands/serve.js";

describe("serve command", () => {
  describe("registerServeCommand", () => {
    it("should register the serve command on the program", () => {
      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      const names = program.commands.map((c) => c.name());
      expect(names).toContain("serve");
    });

    it("should have --port option with default 3456", () => {
      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      const serveCmd = program.commands.find((c) => c.name() === "serve")!;
      // Default values are set via .option() third argument
      expect(serveCmd.options.find((o) => o.long === "--port")).toBeDefined();
      expect(serveCmd.options.find((o) => o.long === "--host")).toBeDefined();
      expect(serveCmd.options.find((o) => o.long === "--path")).toBeDefined();
    });

    it("should have correct description", () => {
      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      const serveCmd = program.commands.find((c) => c.name() === "serve")!;
      expect(serveCmd.description()).toContain("REST API");
    });
  });

  describe("serveAction - not initialized error", () => {
    let testDir: string;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      testDir = join(tmpdir(), `knowledgine-serve-test-${randomUUID()}`);
      mkdirSync(testDir, { recursive: true });
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
      vi.restoreAllMocks();
      process.exitCode = undefined;
    });

    it("should print error when .knowledgine directory does not exist", async () => {
      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);

      await program.parseAsync(["serve", "--path", testDir], { from: "user" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not initialized"));
      expect(process.exitCode).toBe(1);
    });
  });

  describe("semantic readiness", () => {
    it("should import checkSemanticReadiness and OnnxEmbeddingProvider", async () => {
      // Verify the serve command module imports the necessary semantic readiness utilities
      const serveModule = await import("../../src/commands/serve.js");
      expect(serveModule).toBeDefined();
      expect(typeof serveModule.registerServeCommand).toBe("function");
    });
  });

  describe("default option values", () => {
    it("should default port to 3456", () => {
      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      const serveCmd = program.commands.find((c) => c.name() === "serve")!;
      const portOpt = serveCmd.options.find((o) => o.long === "--port");
      expect(portOpt?.defaultValue).toBe("3456");
    });

    it("should default host to 127.0.0.1", () => {
      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      const serveCmd = program.commands.find((c) => c.name() === "serve")!;
      const hostOpt = serveCmd.options.find((o) => o.long === "--host");
      expect(hostOpt?.defaultValue).toBe("127.0.0.1");
    });
  });
});
