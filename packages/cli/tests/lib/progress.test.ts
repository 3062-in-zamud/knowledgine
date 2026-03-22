import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgress, createStepProgress, formatDuration } from "../../src/lib/progress.js";

describe("formatDuration", () => {
  it("should format milliseconds under 1 second", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(42)).toBe("42ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("should format seconds under 1 minute", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1200)).toBe("1.2s");
    expect(formatDuration(59999)).toBe("60.0s");
  });

  it("should format minutes", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(83_000)).toBe("1m 23s");
    expect(formatDuration(150_000)).toBe("2m 30s");
  });

  it("should handle boundary at 999ms → 1000ms", () => {
    expect(formatDuration(999)).toBe("999ms");
    expect(formatDuration(1000)).toBe("1.0s");
  });
});

describe("createProgress", () => {
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrWriteSpy.mockRestore();
  });

  describe("TTY mode", () => {
    beforeEach(() => {
      Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    });

    afterEach(() => {
      Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    });

    it("should output in-place updates with \\r", () => {
      const progress = createProgress(10, "Testing");
      progress.update(3, "file.md");

      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining("\r[3/10] Testing... file.md"),
      );
    });

    it("should output finish line with newline", () => {
      const progress = createProgress(5, "Indexing");
      progress.finish();

      const calls = stderrWriteSpy.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/\r\[5\/5\] Indexing \(\d+ms\)\n/);
    });
  });

  describe("non-TTY mode", () => {
    beforeEach(() => {
      Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    });

    afterEach(() => {
      Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    });

    it("should output milestone lines only", () => {
      const progress = createProgress(100, "Processing");

      // First call triggers milestone 0
      progress.update(1);
      expect(stderrWriteSpy).toHaveBeenCalledTimes(1);

      // Calls within same milestone range should not output
      stderrWriteSpy.mockClear();
      progress.update(10);
      expect(stderrWriteSpy).toHaveBeenCalledTimes(0);

      // 25% milestone
      progress.update(26);
      expect(stderrWriteSpy).toHaveBeenCalledTimes(1);
    });

    it("should output finish with total and duration", () => {
      const progress = createProgress(50, "Building");
      progress.finish();

      const calls = stderrWriteSpy.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/Building: 50 done \(\d+ms\)\n/);
    });
  });

  describe("NO_COLOR support", () => {
    it("should work with NO_COLOR set", () => {
      process.env["NO_COLOR"] = "1";
      Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });

      const progress = createProgress(10, "Test");
      progress.update(5);

      expect(stderrWriteSpy).toHaveBeenCalled();

      delete process.env["NO_COLOR"];
    });
  });
});

describe("createStepProgress", () => {
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
  let output: string;

  beforeEach(() => {
    output = "";
    stderrWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      output += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    stderrWriteSpy.mockRestore();
    delete process.env["NO_COLOR"];
  });

  it("should print title when provided", () => {
    createStepProgress(3, "My Title");
    expect(output).toContain("My Title");
  });

  it("should print running indicator on startStep", () => {
    const steps = createStepProgress(2);
    steps.startStep("Loading config");
    expect(output).toContain("Loading config");
  });

  it("should mark a completed step with done icon", () => {
    process.env["NO_COLOR"] = "1";
    const steps = createStepProgress(2);
    steps.startStep("Step A");
    output = ""; // reset after start output
    steps.completeStep("Step A");
    expect(output).toContain("[ok]");
    expect(output).toContain("Step A");
  });

  it("should mark a failed step with fail icon and reason", () => {
    process.env["NO_COLOR"] = "1";
    const steps = createStepProgress(2);
    steps.failStep("Step B", "disk full");
    expect(output).toContain("[fail]");
    expect(output).toContain("Step B");
    expect(output).toContain("disk full");
  });

  it("should mark a skipped step with skip icon and reason", () => {
    process.env["NO_COLOR"] = "1";
    const steps = createStepProgress(2);
    steps.skipStep("Step C", "already done");
    expect(output).toContain("[skip]");
    expect(output).toContain("Step C");
    expect(output).toContain("already done");
  });

  it("should print warning messages with '!' prefix", () => {
    const steps = createStepProgress(1);
    steps.warn("Something unexpected happened");
    expect(output).toContain("!");
    expect(output).toContain("Something unexpected happened");
  });

  it("should include duration in finish output", () => {
    const steps = createStepProgress(2);
    steps.startStep("X");
    steps.completeStep("X");
    output = "";
    steps.finish();
    // Should contain a duration string like "0ms", "1ms", etc.
    expect(output).toMatch(/\d+ms|\d+\.\d+s|\d+m \d+s/);
  });

  it("should report failed steps count in finish summary", () => {
    process.env["NO_COLOR"] = "1";
    const steps = createStepProgress(2);
    steps.failStep("Step A", "error");
    output = "";
    steps.finish();
    expect(output).toContain("failed");
  });

  it("should report clean success in finish when all done", () => {
    process.env["NO_COLOR"] = "1";
    const steps = createStepProgress(1);
    steps.startStep("X");
    steps.completeStep("X");
    output = "";
    steps.finish();
    expect(output).toContain("completed");
  });

  it("should handle step that was not started before completing", () => {
    process.env["NO_COLOR"] = "1";
    const steps = createStepProgress(1);
    // completeStep without prior startStep should not throw
    expect(() => steps.completeStep("Orphan step")).not.toThrow();
    expect(output).toContain("Orphan step");
  });

  it("should use text icons when NO_COLOR is set", () => {
    process.env["NO_COLOR"] = "1";
    const steps = createStepProgress(1);
    steps.completeStep("Done step");
    expect(output).toContain("[ok]");
    steps.failStep("Fail step");
    expect(output).toContain("[fail]");
    steps.skipStep("Skip step");
    expect(output).toContain("[skip]");
  });

  it("should work without title", () => {
    const steps = createStepProgress(1);
    // No title — first write should be triggered by a step, not by title
    steps.startStep("First step");
    expect(output).toContain("First step");
  });
});
