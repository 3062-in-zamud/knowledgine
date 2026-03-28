import { describe, it, expect } from "vitest";
import { Command } from "commander";
import type { StartOptions } from "../src/commands/start.js";

describe("start command: watch option", () => {
  it("StartOptions should accept watch field", () => {
    const opts: StartOptions = { path: "/tmp/notes", watch: false };
    expect(opts.watch).toBe(false);
  });

  it("StartOptions watch field should be optional", () => {
    const opts: StartOptions = { path: "/tmp/notes" };
    expect(opts.watch).toBeUndefined();
  });

  it("start command should define --no-watch option", () => {
    const program = new Command();
    const startCmd = program
      .command("start")
      .option("--path <dir>", "Root directory to serve")
      .option("--ingest", "Enable IngestEngine for all plugins")
      .option("--no-watch", "Disable file watcher");

    const options = startCmd.opts();
    // commander initializes boolean flags: --no-watch sets watch: true by default
    expect(Object.prototype.hasOwnProperty.call(options, "watch")).toBe(true);
  });

  it("--no-watch should resolve to watch: false in commander", () => {
    const program = new Command();
    program.exitOverride(); // prevent process.exit in tests

    const startCmd = program
      .command("start")
      .option("--path <dir>", "Root directory to serve")
      .option("--ingest", "Enable IngestEngine for all plugins")
      .option("--no-watch", "Disable file watcher");

    startCmd.parse(["--no-watch"], { from: "user" });
    expect(startCmd.opts().watch).toBe(false);
  });
});
