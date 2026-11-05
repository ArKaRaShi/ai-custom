import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileSystem as files } from "@/scripts/io/file-system";
import { globMatcher } from "@/scripts/io/glob-matcher";
import { createIo } from "@/scripts/io/io";
import { SyncError, validatePlan } from "@/scripts/lib/plan";
import { readPlanFile, savePlan } from "@/scripts/lib/plan-store";
import { filterItems, pathRuleMatches } from "@/scripts/lib/target-matcher";
import { isUnboundedTarget, matchesTarget, normalizeTarget } from "@/scripts/lib/targets";

describe("targets", () => {
  const glob = (pattern: string, value: string): boolean => new Bun.Glob(pattern).match(value);

  it("normalizes and classifies targets", () => {
    expect(normalizeTarget(" ./a\\b/ ")).toBe("a/b");
    expect(isUnboundedTarget("**")).toBe(true);
    expect(isUnboundedTarget("a/*")).toBe(false);
  });

  it("matches root, item, and path targets exactly or by glob", () => {
    const candidate = { root: "rules", path: "sub/py.md" };
    expect(matchesTarget("rules", candidate, glob)).toBe(true);
    expect(matchesTarget("rules:sub", candidate, glob)).toBe(true);
    expect(matchesTarget("sub/*.md", candidate, glob)).toBe(true);
    expect(matchesTarget("ru", candidate, glob)).toBe(false);
  });
});

describe("plan validation", () => {
  it("rejects non-plan data with PLAN_INVALID", () => {
    try {
      validatePlan({ version: 2 });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).errors[0]?.code).toBe("PLAN_INVALID");
    }
  });

  it("accepts an empty prune plan", () => {
    const plan = validatePlan({
      version: 1,
      operation: "prune",
      repository: { path: "/repo", headCommit: null },
      scope: { roots: [], targets: [], resolvedPaths: [] },
      policyHash: "p",
      bindingsHash: "b",
      actions: [],
      git: null,
    });
    expect(plan.operation).toBe("prune");
  });
});

describe("io against real dependencies", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-foundation-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("fileSystem lists files, hashes, digests, and writes atomically", () => {
    fs.mkdirSync(path.join(dir, "node_modules"));
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "node_modules", "x.js"), "x");
    fs.writeFileSync(path.join(dir, ".DS_Store"), "x");
    fs.writeFileSync(path.join(dir, "sub", "a.txt"), "a");
    expect(files.getAllFiles(dir).map((f) => path.relative(dir, f))).toEqual([
      path.join("sub", "a.txt"),
    ]);
    expect(files.getAllFiles(path.join(dir, "missing"))).toEqual([]);
    expect(files.sha256(path.join(dir, "missing"))).toBe("");
    expect(files.digest(path.join(dir, "missing"))).toEqual({ kind: "absent" });
    expect(files.digest(dir)).toEqual({ kind: "dir" });
    fs.symlinkSync("sub/a.txt", path.join(dir, "link"));
    expect(files.digest(path.join(dir, "link"))).toEqual({ kind: "symlink", target: "sub/a.txt" });
    const digest = files.digest(path.join(dir, "sub", "a.txt"));
    expect(digest.kind).toBe("file");
    const out = path.join(dir, "deep", "out.json");
    files.writeTextAtomic(out, "{}\n");
    expect(fs.readFileSync(out, "utf8")).toBe("{}\n");
    expect(fs.readdirSync(path.join(dir, "deep"))).toEqual(["out.json"]);
    expect(files.nearestRealPath(path.join(dir, "nope", "x"))).toBe(
      path.join(fs.realpathSync(dir), "nope", "x"),
    );
  });

  it("plan store round-trips a plan and guards output locations", () => {
    const io = createIo();
    const plan = validatePlan({
      version: 1,
      operation: "push",
      repository: { path: dir, headCommit: null },
      scope: { roots: [], targets: [], resolvedPaths: [] },
      policyHash: "p",
      bindingsHash: "b",
      actions: [],
      git: null,
    });
    const file = path.join(dir, "out", "plan.json");
    expect(savePlan(io, plan, file, [path.join(dir, "elsewhere")])).toBe(file);
    expect(readPlanFile(io, file)).toEqual(plan);
    expect(() => savePlan(io, plan, file, [dir])).toThrow(SyncError);
    expect(() => readPlanFile(io, path.join(dir, "absent.json"))).toThrow(SyncError);
  });

  it("globMatcher and target matching apply globs and gitignore rules", () => {
    const io = createIo();
    expect(globMatcher.matches("*.md", "a.md")).toBe(true);
    expect(globMatcher.ruleMatches("build/", "build/x.js")).toBe(true);
    expect(globMatcher.isValidRule("ok/**")).toBe(true);
    expect(filterItems(io, ["a/x.md", "b/y.md"], { targets: ["a"] })).toEqual(["a/x.md"]);
    expect(
      pathRuleMatches(io, { kind: "path", root: "r", path: "*.log", sync: false }, "x.log"),
    ).toBe(true);
  });
});
