import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getClineStorageDir,
  computeStorageHash,
} from "../../../src/plugins/cline-sessions/storage-locator.js";

describe("storage-locator", () => {
  const originalEnv = process.env["CLINE_STORAGE_PATH"];
  const originalAppData = process.env["APPDATA"];

  beforeEach(() => {
    delete process.env["CLINE_STORAGE_PATH"];
    delete process.env["APPDATA"];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["CLINE_STORAGE_PATH"];
    } else {
      process.env["CLINE_STORAGE_PATH"] = originalEnv;
    }
    if (originalAppData === undefined) {
      delete process.env["APPDATA"];
    } else {
      process.env["APPDATA"] = originalAppData;
    }
    vi.unstubAllGlobals();
  });

  describe("getClineStorageDir", () => {
    it("returns a darwin default path that includes globalStorage and saoudrizwan.claude-dev", () => {
      vi.stubGlobal("process", { ...process, platform: "darwin" });
      const result = getClineStorageDir();
      expect(result).toContain("globalStorage");
      expect(result).toContain("saoudrizwan.claude-dev");
    });

    it("respects CLINE_STORAGE_PATH when set to an absolute existing path", async () => {
      const tmp = await mkdtemp(join(tmpdir(), "cline-storage-"));
      try {
        process.env["CLINE_STORAGE_PATH"] = tmp;
        const result = getClineStorageDir();
        // realpath canonicalises e.g. /var/folders → /private/var/folders on macOS.
        expect(result).toBe(realpathSync(tmp));
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it("ignores empty string env var (falls through to OS default)", () => {
      process.env["CLINE_STORAGE_PATH"] = "";
      const result = getClineStorageDir();
      expect(result).toContain("saoudrizwan.claude-dev");
    });

    it("throws on relative env var path (security)", () => {
      process.env["CLINE_STORAGE_PATH"] = "relative/path";
      expect(() => getClineStorageDir()).toThrow(/absolute/i);
    });

    it("resolves symlinks in CLINE_STORAGE_PATH", async () => {
      const tmpRoot = await mkdtemp(join(tmpdir(), "cline-symlink-"));
      const real = join(tmpRoot, "real");
      const linked = join(tmpRoot, "link");
      try {
        await mkdir(real, { recursive: true });
        await symlink(real, linked);
        process.env["CLINE_STORAGE_PATH"] = linked;
        const result = getClineStorageDir();
        // realpath normalises symlink. On macOS /private/var/... may prefix tmp.
        expect(result).toBe(realpathSync(real));
      } finally {
        await rm(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe("computeStorageHash", () => {
    it("returns 8 hex characters", () => {
      const h = computeStorageHash("/some/path/saoudrizwan.claude-dev");
      expect(h).toMatch(/^[0-9a-f]{8}$/);
    });

    it("is deterministic for the same input", () => {
      const a = computeStorageHash("/foo/bar");
      const b = computeStorageHash("/foo/bar");
      expect(a).toBe(b);
    });

    it("differs for different inputs", () => {
      const a = computeStorageHash("/foo");
      const b = computeStorageHash("/bar");
      expect(a).not.toBe(b);
    });
  });
});
