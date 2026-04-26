import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  filterReadableProjects,
  canTransferFrom,
  ALLOW_PRIVATE_ENV_VAR,
  PRIVATE_BYPASS_WARNING,
} from "../../src/access/visibility-gate.js";
import type { ProjectEntry } from "../../src/storage/project-db.js";

describe("VisibilityGate", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env[ALLOW_PRIVATE_ENV_VAR];
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    delete process.env[ALLOW_PRIVATE_ENV_VAR];
    stderrSpy.mockRestore();
  });

  describe("filterReadableProjects", () => {
    it("returns public projects unchanged regardless of caller", () => {
      const projects: ProjectEntry[] = [
        { name: "a", path: "/a" },
        { name: "b", path: "/b", visibility: "public" },
      ];
      expect(filterReadableProjects("anyone", projects)).toEqual(projects);
      expect(filterReadableProjects(null, projects)).toEqual(projects);
    });

    it("excludes private projects from a caller not on the allowFrom list", () => {
      const projects: ProjectEntry[] = [
        { name: "open", path: "/open" },
        { name: "secret", path: "/secret", visibility: "private", allowFrom: ["webapp"] },
      ];
      const filtered = filterReadableProjects("intruder", projects);
      expect(filtered.map((p) => p.name)).toEqual(["open"]);
    });

    it("includes private projects when caller is in allowFrom", () => {
      const projects: ProjectEntry[] = [
        { name: "open", path: "/open" },
        { name: "secret", path: "/secret", visibility: "private", allowFrom: ["webapp"] },
      ];
      const filtered = filterReadableProjects("webapp", projects);
      expect(filtered.map((p) => p.name).sort()).toEqual(["open", "secret"]);
    });

    it("treats empty allowFrom: [] as 'no caller permitted'", () => {
      const projects: ProjectEntry[] = [
        { name: "secret", path: "/secret", visibility: "private", allowFrom: [] },
      ];
      expect(filterReadableProjects("webapp", projects)).toEqual([]);
      expect(filterReadableProjects(null, projects)).toEqual([]);
    });

    it("excludes private projects when caller is null (no selfName)", () => {
      const projects: ProjectEntry[] = [
        { name: "open", path: "/open" },
        { name: "secret", path: "/secret", visibility: "private", allowFrom: ["webapp"] },
      ];
      expect(filterReadableProjects(null, projects).map((p) => p.name)).toEqual(["open"]);
    });

    it("preserves project order from input (no implicit re-sort)", () => {
      const projects: ProjectEntry[] = [
        { name: "z", path: "/z" },
        { name: "a", path: "/a" },
        { name: "m", path: "/m" },
      ];
      expect(filterReadableProjects("anyone", projects).map((p) => p.name)).toEqual([
        "z",
        "a",
        "m",
      ]);
    });

    describe("env-var bypass", () => {
      it("includes all projects when KNOWLEDGINE_ALLOW_PRIVATE=1 even with no caller", () => {
        process.env[ALLOW_PRIVATE_ENV_VAR] = "1";
        const projects: ProjectEntry[] = [
          { name: "open", path: "/open" },
          { name: "secret", path: "/secret", visibility: "private", allowFrom: [] },
        ];
        const filtered = filterReadableProjects(null, projects);
        expect(filtered.map((p) => p.name).sort()).toEqual(["open", "secret"]);
      });

      it("emits a stderr warning every time the bypass is triggered", () => {
        process.env[ALLOW_PRIVATE_ENV_VAR] = "1";
        const projects: ProjectEntry[] = [
          { name: "secret", path: "/secret", visibility: "private", allowFrom: [] },
        ];
        filterReadableProjects(null, projects);
        filterReadableProjects(null, projects);
        const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
        expect(calls.filter((c) => c.includes(PRIVATE_BYPASS_WARNING)).length).toBe(2);
      });

      it("does not bypass when env var is set to '0' or 'false'", () => {
        const projects: ProjectEntry[] = [
          { name: "secret", path: "/secret", visibility: "private", allowFrom: [] },
        ];
        process.env[ALLOW_PRIVATE_ENV_VAR] = "0";
        expect(filterReadableProjects(null, projects)).toEqual([]);
        process.env[ALLOW_PRIVATE_ENV_VAR] = "false";
        expect(filterReadableProjects(null, projects)).toEqual([]);
      });
    });
  });

  describe("canTransferFrom", () => {
    it("public project: any caller (including null) may transfer from it", () => {
      const p: ProjectEntry = { name: "open", path: "/open" };
      expect(canTransferFrom("anyone", p)).toBe(true);
      expect(canTransferFrom(null, p)).toBe(true);
    });

    it("private project: caller must be in allowFrom", () => {
      const p: ProjectEntry = {
        name: "secret",
        path: "/secret",
        visibility: "private",
        allowFrom: ["webapp"],
      };
      expect(canTransferFrom("webapp", p)).toBe(true);
      expect(canTransferFrom("intruder", p)).toBe(false);
      expect(canTransferFrom(null, p)).toBe(false);
    });

    it("env-var bypass also affects canTransferFrom and emits warning", () => {
      process.env[ALLOW_PRIVATE_ENV_VAR] = "1";
      const p: ProjectEntry = {
        name: "secret",
        path: "/secret",
        visibility: "private",
        allowFrom: [],
      };
      expect(canTransferFrom(null, p)).toBe(true);
      const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes(PRIVATE_BYPASS_WARNING))).toBe(true);
    });

    it("private project with empty allowFrom blocks even named callers (without bypass)", () => {
      const p: ProjectEntry = {
        name: "lockedDown",
        path: "/lockedDown",
        visibility: "private",
        allowFrom: [],
      };
      expect(canTransferFrom("webapp", p)).toBe(false);
    });
  });
});
