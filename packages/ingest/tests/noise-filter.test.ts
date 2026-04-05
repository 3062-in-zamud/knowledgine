import { describe, it, expect } from "vitest";
import {
  NoiseFilter,
  classifyWithConfidence,
  isBundleCommit,
  classifyNoiseLevel,
} from "../src/noise-filter.js";

describe("NoiseFilter - bundle commit detection", () => {
  const filter = new NoiseFilter();

  it('detects "Bundle 2026-W9" as bundle commit', () => {
    expect(filter.isBundleCommit("Bundle 2026-W9")).toBe(true);
  });

  it('detects "Merge 76 commits" as bundle commit', () => {
    expect(filter.isBundleCommit("Merge 76 commits")).toBe(true);
  });

  it('detects "Merge 1 commit" as bundle commit', () => {
    expect(filter.isBundleCommit("Merge 1 commit")).toBe(true);
  });

  it('detects "Auto-merge" as bundle commit', () => {
    expect(filter.isBundleCommit("Auto-merge")).toBe(true);
  });

  it('detects "Automerge" as bundle commit', () => {
    expect(filter.isBundleCommit("Automerge")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(filter.isBundleCommit("bundle 2026-W9")).toBe(true);
    expect(filter.isBundleCommit("MERGE 76 COMMITS")).toBe(true);
    expect(filter.isBundleCommit("auto-merge")).toBe(true);
  });

  it('does not match "Bundle" alone', () => {
    expect(filter.isBundleCommit("Bundle")).toBe(false);
  });

  it('does not match "Merged some code"', () => {
    expect(filter.isBundleCommit("Merged some code")).toBe(false);
  });

  it("classifies bundle commits as low-value", () => {
    expect(classifyNoiseLevel("Bundle 2026-W9", "user", [])).toBe("low-value");
    expect(classifyNoiseLevel("Merge 76 commits", "user", [])).toBe("low-value");
    expect(classifyNoiseLevel("Auto-merge", "user", [])).toBe("low-value");
  });
});

describe("classifyWithConfidence", () => {
  it("returns confidence 0.0 for noise level", () => {
    const noiseResult = classifyWithConfidence("update translations", "user", [
      "locales/en.json",
      "locales/ja.json",
    ]);
    expect(noiseResult.level).toBe("noise");
    expect(noiseResult.confidence).toBe(0.0);
  });

  it("returns confidence 0.3 for low-value level", () => {
    const result = classifyWithConfidence("Bundle 2026-W9", "user", []);
    expect(result.level).toBe("low-value");
    expect(result.confidence).toBe(0.3);
  });

  it("returns confidence 1.0 for normal level", () => {
    const result = classifyWithConfidence("feat: add new feature", "user", ["src/index.ts"]);
    expect(result.level).toBe("normal");
    expect(result.confidence).toBe(1.0);
  });
});

describe("isBundleCommit module-level function", () => {
  it("delegates to default filter", () => {
    expect(isBundleCommit("Bundle 2026-W9")).toBe(true);
    expect(isBundleCommit("normal commit")).toBe(false);
  });
});
