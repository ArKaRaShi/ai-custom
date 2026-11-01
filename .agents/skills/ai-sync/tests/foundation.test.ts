import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PlanStore } from "@/scripts/application/services/plan-store";
import { TargetMatcher } from "@/scripts/application/services/target-matcher";
import { SyncError, validatePlan } from "@/scripts/domain/plan";
import { isUnboundedTarget, matchesTarget, normalizeTarget } from "@/scripts/domain/targets";
import { BunGlobMatcher } from "@/scripts/infrastructure/bun-glob-matcher";
import { NodeFileSystem } from "@/scripts/infrastructure/node-file-system";

describe("domain targets", () => {
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

describe("domain plan validation", () => {
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

describe("adapters against real dependencies", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-foundation-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("NodeFileSystem lists files, hashes, digests, and writes atomically", () => {
    const files = new NodeFileSystem();
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

  it("PlanStore round-trips a plan and guards output locations", () => {
    const store = new PlanStore({ fileSystem: new NodeFileSystem() });
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
    expect(store.savePlan(plan, file, [path.join(dir, "elsewhere")])).toBe(file);
    expect(store.readPlanFile(file)).toEqual(plan);
    expect(() => store.savePlan(plan, file, [dir])).toThrow(SyncError);
    expect(() => store.readPlanFile(path.join(dir, "absent.json"))).toThrow(SyncError);
  });

  it("BunGlobMatcher and TargetMatcher apply globs and gitignore rules", () => {
    const glob = new BunGlobMatcher();
    expect(glob.matches("*.md", "a.md")).toBe(true);
    expect(glob.ruleMatches("build/", "build/x.js")).toBe(true);
    expect(glob.isValidRule("ok/**")).toBe(true);
    const matcher = new TargetMatcher(glob);
    expect(matcher.filterItems(["a/x.md", "b/y.md"], { targets: ["a"] })).toEqual(["a/x.md"]);
    expect(
      matcher.pathRuleMatches({ kind: "path", root: "r", path: "*.log", sync: false }, "x.log"),
    ).toBe(true);
  });
});
