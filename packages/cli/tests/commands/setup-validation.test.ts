import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { setupCommand, TARGETS } from "../../src/commands/setup.js";

describe("setupCommand target validation", () => {
  let testDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-setup-validation-test-"));
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it("should reject unknown target value", async () => {
    await setupCommand({ target: "unknown-editor", path: testDir });

    expect(process.exitCode).toBe(1);
    const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain('Invalid target "unknown-editor"');
  });

  it("should list valid targets on invalid target error", async () => {
    await setupCommand({ target: "not-a-tool", path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    // All valid target values should be mentioned
    for (const t of TARGETS) {
      expect(output).toContain(t.value);
    }
  });

  it("should accept claude-desktop as a valid target", async () => {
    await setupCommand({ target: "claude-desktop", path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("Invalid target");
    expect(process.exitCode).toBeUndefined();
  });

  it("should accept cursor as a valid target", async () => {
    await setupCommand({ target: "cursor", path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("Invalid target");
    expect(process.exitCode).toBeUndefined();
  });

  it("should accept claude-code as a valid target", async () => {
    await setupCommand({ target: "claude-code", path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("Invalid target");
    expect(process.exitCode).toBeUndefined();
  });
});
