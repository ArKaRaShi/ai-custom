import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { MergeResult } from "@/scripts/io/command-runner";
import { createIo } from "@/scripts/io/io";
import { inspectItems as inspectItemsIn } from "@/scripts/lib/inspect";
import { type Locations, syncPolicyOf, type UnifiedManifest } from "@/scripts/lib/manifest";
import {
  type Digest,
  hashCanonical,
  type InspectItem,
  type Plan,
  type PlanAction,
  type Result,
  SyncError,
  validatePlan,
} from "@/scripts/lib/plan";
import { pathEscapesRoot as pathEscapesRootIn } from "@/scripts/lib/plan-builder";
import { type ExecuteHooks, executePlan as executePlanIn } from "@/scripts/lib/plan-executor";
import {
  filterItems as filterItemsIn,
  matchesTarget as matchesTargetIn,
} from "@/scripts/lib/target-matcher";
import {
  isUnboundedTarget,
  matchesPattern,
  type SyncOptions,
  type TargetCandidate,
} from "@/scripts/lib/targets";
import { at } from "./helpers/at";

const io = createIo();
const { fileSystem } = io;
const matchesTarget = (target: string, candidate: TargetCandidate): boolean =>
  matchesTargetIn(io, target, candidate);
const filterItems = (paths: string[], opts: SyncOptions): string[] =>
  filterItemsIn(io, paths, opts);
const inspectItems = (
  manifest: UnifiedManifest,
  locations: Locations,
  targets: string[],
): { items: InspectItem[]; unknown: string[] } =>
  inspectItemsIn(manifest, locations, targets, matchesTarget);
const digestOf = (location: string): Digest => fileSystem.digest(location);
const copyFileSafe = (src: string, dest: string): void => fileSystem.copyFile(src, dest);
const getAllFiles = (dir: string): string[] => fileSystem.getAllFiles(dir);
const plainMergeFiles = (local: string, repo: string, base?: string): MergeResult =>
  io.commandRunner.mergeFiles(local, repo, base);
const executePlan = (plan: Plan, hooks: ExecuteHooks = {}): Result =>
  executePlanIn(io, plan, hooks);
const pathEscapesRoot = (base: string, relPath: string): boolean =>
  pathEscapesRootIn(io, base, relPath);

describe("path filters", () => {
  it("matches and excludes paths consistently", () => {
    expect(matchesPattern("extensions/foo/SKILL.md", ["foo"])).toBe(true);
    expect(matchesPattern("extensions/bar/SKILL.md", ["foo"])).toBe(false);
    expect(matchesPattern("rules/tmp.log", ["*.log"])).toBe(true);
    const paths = ["extensions/foo/SKILL.md", "extensions/bar/SKILL.md", "rules/py.md"];
    expect(filterItems(paths, { targets: ["extensions"], exclude: ["foo"] })).toEqual([
      "extensions/bar/SKILL.md",
    ]);
    expect(filterItems(paths, { targets: ["ext"] })).toEqual([]);
  });
});

describe("sync file helpers", () => {
  let tmpHome: string;
  let tmpRepo: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-sync-home-"));
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-sync-repo-"));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("copyFileSafe writes bytes and creates intermediate directories", () => {
    const src = path.join(tmpHome, "src.txt");
    const dest = path.join(tmpRepo, "deep", "nested", "dest.txt");
    fs.writeFileSync(src, "hello");
    copyFileSafe(src, dest);
    expect(fs.readFileSync(dest, "utf8")).toBe("hello");
  });

  it("getAllFiles skips .DS_Store, node_modules, and .git entries", () => {
    const dir = path.join(tmpHome, "tree");
    fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, "keep.txt"), "k");
    fs.writeFileSync(path.join(dir, ".DS_Store"), "ds");
    fs.writeFileSync(path.join(dir, "sub", "inside.txt"), "i");
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "x.js"), "x");
    fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main");

    const rels = getAllFiles(dir).map((file) => path.relative(dir, file));
    expect(rels).toContain("keep.txt");
    expect(rels).toContain(path.join("sub", "inside.txt"));
    expect(rels).not.toContain(".DS_Store");
    expect(rels.some((r) => r.startsWith("node_modules"))).toBe(false);
    expect(rels.some((r) => r.startsWith(".git"))).toBe(false);
  });
});

describe("given divergent local and repo files, when plainMergeFiles runs, then non-overlapping edits are combined and overlapping edits yield conflict markers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-merge-behavior-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cleanly merges non-overlapping local and repo edits with a common base", () => {
    const base = path.join(tmpDir, "base.txt");
    const local = path.join(tmpDir, "local.txt");
    const repo = path.join(tmpDir, "repo.txt");
    fs.writeFileSync(base, "intro\n\nmiddle\n\noutro\n");
    fs.writeFileSync(local, "intro\n\nmiddle (local)\n\noutro\n");
    fs.writeFileSync(repo, "intro\n\nmiddle\n\noutro (repo)\n");

    const res = plainMergeFiles(local, repo, base);
    expect(res.success).toBe(true);
    expect(res.hasConflicts).toBe(false);
    expect(res.content).toContain("middle (local)");
    expect(res.content).toContain("outro (repo)");
  });

  it("inserts conflict markers when local and repo change the same line", () => {
    const local = path.join(tmpDir, "local.txt");
    const repo = path.join(tmpDir, "repo.txt");
    fs.writeFileSync(local, "name: local\n");
    fs.writeFileSync(repo, "name: repo\n");

    const res = plainMergeFiles(local, repo);
    expect(res.hasConflicts).toBe(true);
    expect(res.content).toContain("<<<<<<<");
    expect(res.content).toContain(">>>>>>>");
  });
});

describe("given explicit targets, when matching candidates, then selection is exact or glob and never a substring", () => {
  const file = { root: "omp", path: "extensions/orca-a/index.ts" };
  const skill = { root: "agents", item: "mentor", path: "mentor/SKILL.md" };

  it("matches a root id, an item name, a file, a directory, and a root-qualified path", () => {
    expect(matchesTarget("omp", file)).toBe(true);
    expect(matchesTarget("agents", skill)).toBe(true);
    expect(matchesTarget("mentor", skill)).toBe(true);
    expect(matchesTarget("extensions/orca-a/index.ts", file)).toBe(true);
    expect(matchesTarget("extensions", file)).toBe(true);
    expect(matchesTarget("extensions/", file)).toBe(true);
    expect(matchesTarget("omp:extensions/orca-a", file)).toBe(true);
    expect(matchesTarget("omp:", file)).toBe(true);
    expect(matchesTarget("agents:extensions", file)).toBe(false);
  });

  it("rejects substrings, prefixes of a name, and other roots", () => {
    expect(matchesTarget("ext", file)).toBe(false);
    expect(matchesTarget("orca-a", file)).toBe(false);
    expect(matchesTarget("index.ts", file)).toBe(false);
    expect(matchesTarget("ment", skill)).toBe(false);
    expect(matchesTarget("om", file)).toBe(false);
    expect(matchesTarget("", file)).toBe(false);
  });

  it("matches globs against the root, item, file, and any ancestor directory", () => {
    expect(matchesTarget("extensions/orca-*", file)).toBe(true);
    expect(matchesTarget("extensions/*/index.ts", file)).toBe(true);
    expect(matchesTarget("**/*.ts", file)).toBe(true);
    expect(matchesTarget("*.md", file)).toBe(false);
    expect(matchesTarget("ment*", skill)).toBe(true);
    expect(matchesTarget("omp:**/*.md", file)).toBe(false);
  });

  it("identifies targets that select everything", () => {
    for (const target of ["*", "**", "**/*", "", "/", "?"])
      expect(isUnboundedTarget(target)).toBe(true);
    for (const target of ["a.txt", "omp", "extensions/*", "*.ts"])
      expect(isUnboundedTarget(target)).toBe(false);
  });
});

describe("given locations, when fingerprinting, then absent, directory, symlink, and file states are explicit", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-digest-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("marks a missing path absent instead of fabricating a hash", () => {
    expect(digestOf(path.join(dir, "missing.txt"))).toEqual({ kind: "absent" });
    expect(digestOf(path.join(dir, "missing", "deeper.txt"))).toEqual({ kind: "absent" });
  });

  it("hashes regular files with their mode and reports directories", () => {
    const file = path.join(dir, "a.txt");
    fs.writeFileSync(file, "hello");
    fs.chmodSync(file, 0o640);
    expect(digestOf(file)).toEqual({
      kind: "file",
      sha256: createHash("sha256").update("hello").digest("hex"),
      mode: 0o640,
    });
    expect(digestOf(dir)).toEqual({ kind: "dir" });
  });

  it("reports a symlink and its target without following it", () => {
    const real = path.join(dir, "real.txt");
    fs.writeFileSync(real, "x");
    fs.symlinkSync(real, path.join(dir, "link.txt"));
    fs.symlinkSync(path.join(dir, "gone"), path.join(dir, "dangling"));
    expect(digestOf(path.join(dir, "link.txt"))).toEqual({ kind: "symlink", target: real });
    expect(digestOf(path.join(dir, "dangling"))).toEqual({
      kind: "symlink",
      target: path.join(dir, "gone"),
    });
  });
});

describe("given a plan, when executing, then each action rechecks its preconditions and failures are reported as partial", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-exec-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function buildPlan(names: string[]): Plan {
    const actions: PlanAction[] = names.map((name, index) => {
      const source = path.join(dir, "src", name);
      const target = path.join(dir, "dst", name);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, `content ${name}`);
      return {
        id: `a${index + 1}`,
        type: "copy" as const,
        root: "omp",
        path: name,
        source: { location: source, digest: digestOf(source) },
        target: { location: target, digest: digestOf(target) },
      };
    });
    return {
      version: 1,
      operation: "push",
      repository: { path: path.join(dir, "repo"), headCommit: null },
      scope: {
        roots: ["omp"],
        targets: [],
        resolvedPaths: actions.map((action) => `omp:${action.path}`),
      },
      policyHash: "0".repeat(64),
      bindingsHash: "1".repeat(64),
      actions,
      git: null,
    };
  }

  it("completes every action when nothing changes", () => {
    const plan = buildPlan(["a.txt", "b.txt"]);
    const result = executePlan(plan);
    expect(result.outcome).toBe("success");
    expect(result.actions).toEqual([
      { id: "a1", state: "completed" },
      { id: "a2", state: "completed" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.recovery).toBeNull();
    expect(fs.readFileSync(path.join(dir, "dst", "b.txt"), "utf8")).toBe("content b.txt");
  });

  it("fails the action whose source changed mid-apply, skips later ones, and reports partial", () => {
    const plan = buildPlan(["a.txt", "b.txt", "c.txt"]);
    const result = executePlan(plan, {
      beforeAction: (action) => {
        if (action.id === "a2") fs.writeFileSync(action.source.location, "changed during apply");
      },
    });
    expect(result.outcome).toBe("partial");
    expect(result.actions.map((action) => action.state)).toEqual([
      "completed",
      "failed",
      "not_attempted",
    ]);
    expect(at(result.actions, 1).error).toContain("changed since the preview");
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "PLAN_STALE_SOURCE", item: "omp:b.txt" }),
    ]);
    expect(result.recovery).toContain("no rollback");
    expect(fs.existsSync(path.join(dir, "dst", "a.txt"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "dst", "b.txt"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "dst", "c.txt"))).toBe(false);
  });

  it("fails a target that appeared mid-apply without overwriting it", () => {
    const plan = buildPlan(["a.txt", "b.txt"]);
    const result = executePlan(plan, {
      beforeAction: (action) => {
        if (action.id === "a2") {
          fs.mkdirSync(path.dirname(action.target.location), { recursive: true });
          fs.writeFileSync(action.target.location, "foreign");
        }
      },
    });
    expect(result.outcome).toBe("partial");
    expect(result.errors[0]?.code).toBe("PLAN_STALE_TARGET");
    expect(fs.readFileSync(path.join(dir, "dst", "b.txt"), "utf8")).toBe("foreign");
  });

  it("reports failed, not partial, when the first action cannot run", () => {
    const plan = buildPlan(["a.txt", "b.txt"]);
    const result = executePlan(plan, {
      beforeAction: (action) => {
        if (action.id === "a1") fs.rmSync(action.source.location);
      },
    });
    expect(result.outcome).toBe("failed");
    expect(result.actions.map((action) => action.state)).toEqual(["failed", "not_attempted"]);
    expect(fs.existsSync(path.join(dir, "dst"))).toBe(false);
  });

  it("never follows symlinks: a skip action is reported, not executed", () => {
    const plan = buildPlan(["a.txt", "b.txt"]);
    const link = path.join(dir, "src", "link.txt");
    fs.symlinkSync(at(plan.actions, 0).source.location, link);
    plan.actions.push({
      id: "a3",
      type: "skip",
      root: "omp",
      path: "link.txt",
      source: { location: link, digest: digestOf(link) },
      target: { location: path.join(dir, "dst", "link.txt"), digest: { kind: "absent" } },
    });
    plan.scope.resolvedPaths.push("omp:link.txt");
    const result = executePlan(plan);
    expect(result.outcome).toBe("partial");
    expect(result.actions.map((action) => action.state)).toEqual([
      "completed",
      "completed",
      "not_attempted",
    ]);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "SYMLINK_UNSUPPORTED", item: "omp:link.txt" }),
    ]);
    expect(fs.existsSync(path.join(dir, "dst", "link.txt"))).toBe(false);
  });

  it("validates a plan structurally and rejects traversal and inconsistent scope", () => {
    const plan = buildPlan(["a.txt"]);
    expect(validatePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);

    const traversal = JSON.parse(JSON.stringify(plan)) as Plan;
    at(traversal.actions, 0).path = "../escape.txt";
    traversal.scope.resolvedPaths = ["omp:../escape.txt"];
    expect(codeOf(() => validatePlan(traversal))).toBe("PATH_ESCAPE");

    const mismatched = JSON.parse(JSON.stringify(plan)) as Plan;
    mismatched.scope.resolvedPaths = ["omp:other.txt"];
    expect(codeOf(() => validatePlan(mismatched))).toBe("PLAN_INVALID");

    const badDigest = JSON.parse(JSON.stringify(plan)) as Plan;
    at(badDigest.actions, 0).source.digest = { kind: "file", sha256: "short", mode: 0o644 };
    expect(codeOf(() => validatePlan(badDigest))).toBe("PLAN_INVALID");

    const wrongVersion = { ...JSON.parse(JSON.stringify(plan)), version: 2 };
    expect(codeOf(() => validatePlan(wrongVersion))).toBe("PLAN_INVALID");
  });
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof SyncError ? error.errors[0]?.code : undefined;
  }
  return undefined;
}

describe("given a shared manifest and one machine's bindings, when items are inspected, then each resolves through this machine's binding without altering policy", () => {
  const manifest: UnifiedManifest = {
    version: 2,
    roots: {
      omp: { kind: "path", repoRoot: ".omp" },
      agents: { kind: "skill", repoRoot: ".agents/skills" },
    },
    entries: [
      { kind: "path", root: "omp", path: "config.yml", sync: true, version: "1.0" },
      { kind: "path", root: "omp", path: "private/**", sync: false },
      { kind: "skill", root: "agents", path: "mine", sync: true, skill: { origin: "authored" } },
      {
        kind: "skill",
        root: "agents",
        path: "tool",
        sync: false,
        skill: {
          origin: "external",
          source: "org/tool",
          version: "2.0",
          install: "npx skills add org/tool -g",
        },
      },
    ],
  };

  it("lists kind, root, path, policy, version or null, and the local path in manifest order", () => {
    const locations: Locations = {
      version: 1,
      roots: { omp: "/machine-a/omp", agents: "/machine-a/skills" },
    };
    const { items, unknown } = inspectItems(manifest, locations, []);
    expect(unknown).toEqual([]);
    expect(items).toEqual([
      {
        kind: "path",
        root: "omp",
        path: "config.yml",
        policy: "shared",
        version: "1.0",
        local: "/machine-a/omp/config.yml",
      },
      {
        kind: "path",
        root: "omp",
        path: "private/**",
        policy: "local-only",
        version: null,
        local: "/machine-a/omp/private/**",
      },
      {
        kind: "skill",
        root: "agents",
        path: "mine",
        policy: "shared",
        version: null,
        local: "/machine-a/skills/mine",
        origin: "authored",
        source: null,
        install: null,
      },
      {
        kind: "skill",
        root: "agents",
        path: "tool",
        policy: "local-only",
        version: "2.0",
        local: "/machine-a/skills/tool",
        origin: "external",
        source: "org/tool",
        install: "npx skills add org/tool -g",
      },
    ]);
  });

  it("resolves the same shared items to a different path on another machine and reports an unbound root as null", () => {
    const before = JSON.stringify(manifest);
    const machineB: Locations = { version: 1, roots: { omp: "/other/place/omp" } };
    const { items } = inspectItems(manifest, machineB, []);
    expect(items.map((item) => item.local)).toEqual([
      "/other/place/omp/config.yml",
      "/other/place/omp/private/**",
      null,
      null,
    ]);
    expect(JSON.stringify(manifest)).toBe(before);
  });

  it("selects exactly by root, skill name, or root-qualified path and reports targets matching nothing", () => {
    const locations: Locations = { version: 1, roots: { omp: "/a", agents: "/s" } };
    expect(inspectItems(manifest, locations, ["agents"]).items.map((item) => item.path)).toEqual([
      "mine",
      "tool",
    ]);
    expect(inspectItems(manifest, locations, ["tool"]).items.map((item) => item.path)).toEqual([
      "tool",
    ]);
    expect(
      inspectItems(manifest, locations, ["omp:config.yml"]).items.map((item) => item.path),
    ).toEqual(["config.yml"]);
    expect(
      inspectItems(manifest, locations, ["tool", "omp:config.yml"]).items.map((item) => item.path),
    ).toEqual(["config.yml", "tool"]);
    const missing = inspectItems(manifest, locations, ["to", "nope"]);
    expect(missing.items).toEqual([]);
    expect(missing.unknown).toEqual(["to", "nope"]);
  });
});

describe("given symlinked directories inside a root, when a plan executes, then no write or read leaves the root (FR-010)", () => {
  let dir: string;
  let outside: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-contain-"));
    outside = path.join(dir, "outside");
    fs.mkdirSync(outside, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A push plan for `names`: sources under `src/`, targets under `dst/`, both written or absent as of now. */
  function planFor(...names: string[]): Plan {
    const actions: PlanAction[] = names.map((name, index) => {
      const source = path.join(dir, "src", name);
      const target = path.join(dir, "dst", name);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.writeFileSync(source, `content ${name}`);
      return {
        id: `a${index + 1}`,
        type: "copy" as const,
        root: "omp",
        path: name,
        source: { location: source, digest: digestOf(source) },
        target: { location: target, digest: digestOf(target) },
      };
    });
    return {
      version: 1,
      operation: "push",
      repository: { path: path.join(dir, "repo"), headCommit: null },
      scope: {
        roots: ["omp"],
        targets: [],
        resolvedPaths: actions.map((action) => `omp:${action.path}`),
      },
      policyHash: "0".repeat(64),
      bindingsHash: "1".repeat(64),
      actions,
      git: null,
    };
  }

  it("refuses to write through a target directory that became a symlink out of the root, and reports partial", () => {
    const plan = planFor("ok.txt", "sub/a.txt");
    fs.mkdirSync(path.join(dir, "dst"), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, "dst", "sub"));
    const result = executePlan(plan);
    expect(result.outcome).toBe("partial");
    expect(result.actions.map((action) => action.state)).toEqual(["completed", "failed"]);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "PATH_ESCAPE", item: "omp:sub/a.txt" }),
    ]);
    expect(result.recovery).toContain("symlink");
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "dst", "ok.txt"), "utf8")).toBe("content ok.txt");
  });

  it("refuses to read through a source directory that is a symlink out of the root", () => {
    const plan = planFor("sub/a.txt");
    fs.writeFileSync(path.join(outside, "a.txt"), "outside secret");
    fs.rmSync(path.join(dir, "src", "sub"), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, "src", "sub"));
    const source = at(plan.actions, 0).source;
    source.digest = digestOf(source.location);
    const result = executePlan(plan);
    expect(result.outcome).toBe("failed");
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "PATH_ESCAPE", item: "omp:sub/a.txt" }),
    ]);
    expect(fs.existsSync(path.join(dir, "dst", "sub", "a.txt"))).toBe(false);
  });

  it("treats a dangling symlinked directory as an escape", () => {
    const plan = planFor("sub/a.txt");
    fs.mkdirSync(path.join(dir, "dst"), { recursive: true });
    fs.symlinkSync(path.join(dir, "nowhere"), path.join(dir, "dst", "sub"));
    const result = executePlan(plan);
    expect(result.outcome).toBe("failed");
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "PATH_ESCAPE", item: "omp:sub/a.txt" }),
    ]);
    expect(fs.existsSync(path.join(dir, "nowhere"))).toBe(false);
  });

  it("allows a symlinked directory that resolves to a place inside the same root", () => {
    const plan = planFor("link/a.txt");
    fs.mkdirSync(path.join(dir, "dst", "real"), { recursive: true });
    fs.symlinkSync(path.join(dir, "dst", "real"), path.join(dir, "dst", "link"));
    const result = executePlan(plan);
    expect(result.outcome).toBe("success");
    expect(fs.readFileSync(path.join(dir, "dst", "real", "a.txt"), "utf8")).toBe(
      "content link/a.txt",
    );
  });

  it("exposes the same check for other callers so removal can reuse it", () => {
    fs.mkdirSync(path.join(dir, "root"), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, "root", "sub"));
    expect(pathEscapesRoot(path.join(dir, "root"), "sub/a.txt")).toBe(true);
    expect(pathEscapesRoot(path.join(dir, "root"), "plain/a.txt")).toBe(false);
    expect(pathEscapesRoot(path.join(dir, "root"), "a.txt")).toBe(false);
  });
});

describe("given version labels, when the shared policy is fingerprinted, then labels are not policy (FR-005, FR-006)", () => {
  const manifest: UnifiedManifest = {
    version: 2,
    roots: {
      omp: { kind: "path", repoRoot: ".omp" },
      agents: { kind: "skill", repoRoot: ".agents/skills" },
    },
    entries: [
      { kind: "path", root: "omp", path: "config.yml", sync: true, version: "1.0" },
      { kind: "path", root: "omp", path: "notes/**", sync: true },
      {
        kind: "skill",
        root: "agents",
        path: "mine",
        sync: true,
        skill: { origin: "authored", version: "2.0", description: "mine" },
      },
      {
        kind: "skill",
        root: "agents",
        path: "tool",
        sync: false,
        skill: { origin: "external", install: "npx skills add org/tool -g" },
      },
    ],
  };

  function relabelled(version: string | undefined): UnifiedManifest {
    const copy = JSON.parse(JSON.stringify(manifest)) as UnifiedManifest;
    for (const entry of copy.entries) {
      if (entry.kind === "path" && entry.path === "notes/**") entry.version = version;
      if (entry.kind === "skill" && entry.path === "mine") entry.skill.version = version;
    }
    return copy;
  }

  it("removes path and skill labels and keeps every field that decides what transfers", () => {
    const policy = syncPolicyOf(manifest);
    expect(policy.entries).toEqual([
      { kind: "path", root: "omp", path: "config.yml", sync: true },
      { kind: "path", root: "omp", path: "notes/**", sync: true },
      {
        kind: "skill",
        root: "agents",
        path: "mine",
        sync: true,
        skill: { origin: "authored", description: "mine" },
      },
      {
        kind: "skill",
        root: "agents",
        path: "tool",
        sync: false,
        skill: { origin: "external", install: "npx skills add org/tool -g" },
      },
    ]);
    expect(policy.roots).toEqual(manifest.roots);
    expect(manifest.entries[0]).toEqual({
      kind: "path",
      root: "omp",
      path: "config.yml",
      sync: true,
      version: "1.0",
    });
  });

  it("fingerprints identically whatever the labels say, including no label at all", () => {
    const base = hashCanonical(syncPolicyOf(manifest));
    expect(hashCanonical(syncPolicyOf(relabelled("9.9")))).toBe(base);
    expect(hashCanonical(syncPolicyOf(relabelled(undefined)))).toBe(base);
  });

  it("still fingerprints a different policy differently", () => {
    const flipped = JSON.parse(JSON.stringify(manifest)) as UnifiedManifest;
    at(flipped.entries, 1).sync = false;
    expect(hashCanonical(syncPolicyOf(flipped))).not.toBe(hashCanonical(syncPolicyOf(manifest)));
  });
});

describe("given a prune plan, when it is validated and executed, then only exact approved backup files are deleted (FR-008, FR-009, FR-010)", () => {
  let dir: string;
  let repo: string;
  let local: string;

  const manifest: UnifiedManifest = {
    version: 2,
    roots: { omp: { kind: "path", repoRoot: ".omp" } },
    entries: [{ kind: "path", root: "omp", path: "private/**", sync: false }],
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-prune-"));
    repo = path.join(dir, "repo");
    local = path.join(dir, "local");
    fs.mkdirSync(path.join(repo, ".ai-sync"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".ai-sync", "manifest.json"), JSON.stringify(manifest));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function backupFile(rel: string, content: string): string {
    const file = path.join(repo, ".omp", ...rel.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  }

  function prunePlan(rels: string[]): Plan {
    const actions: PlanAction[] = rels.map((rel, index) => {
      const target = path.join(repo, ".omp", ...rel.split("/"));
      const source = path.join(local, ...rel.split("/"));
      return {
        id: `a${index + 1}`,
        type: "delete" as const,
        root: "omp",
        path: rel,
        source: { location: source, digest: digestOf(source) },
        target: { location: target, digest: digestOf(target) },
      };
    });
    return {
      version: 1,
      operation: "prune",
      repository: { path: repo, headCommit: null },
      scope: {
        roots: ["omp"],
        targets: [],
        resolvedPaths: actions.map((action) => `omp:${action.path}`),
      },
      policyHash: hashCanonical(syncPolicyOf(manifest)),
      bindingsHash: "0".repeat(64),
      actions,
      git: null,
    };
  }

  function codeOf(fn: () => unknown): string | undefined {
    try {
      fn();
    } catch (error) {
      return error instanceof SyncError ? error.errors[0]?.code : undefined;
    }
    return undefined;
  }

  it("round-trips through validation and rejects delete or prune actions on the wrong operation", () => {
    backupFile("private/a.txt", "a");
    const plan = prunePlan(["private/a.txt"]);
    expect(validatePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);

    const wrongOperation = { ...JSON.parse(JSON.stringify(plan)), operation: "push" };
    expect(codeOf(() => validatePlan(wrongOperation))).toBe("PLAN_INVALID");

    const stalePush = {
      ...JSON.parse(JSON.stringify(plan)),
      operation: "push",
      scope: { ...plan.scope, removeStale: true },
    };
    expect(validatePlan(stalePush).operation).toBe("push");
    const localReappeared = JSON.parse(JSON.stringify(stalePush)) as Plan;
    at(localReappeared.actions, 0).source.digest = { kind: "dir" };
    expect(codeOf(() => validatePlan(localReappeared))).toBe("PLAN_INVALID");
    const staleOnPull = { ...stalePush, operation: "pull" };
    expect(codeOf(() => validatePlan(staleOnPull))).toBe("PLAN_INVALID");

    const copyInPrune = JSON.parse(JSON.stringify(plan)) as Plan;
    at(copyInPrune.actions, 0).type = "copy";
    expect(codeOf(() => validatePlan(copyInPrune))).toBe("PLAN_INVALID");

    const absentDelete = JSON.parse(JSON.stringify(plan)) as Plan;
    at(absentDelete.actions, 0).target.digest = { kind: "absent" };
    expect(codeOf(() => validatePlan(absentDelete))).toBe("PLAN_INVALID");
  });

  it("deletes each planned backup file, leaves the local counterpart and siblings, and reports the Git caveat", () => {
    const first = backupFile("private/a.txt", "a");
    const second = backupFile("private/sub/b.txt", "b");
    const sibling = backupFile("keep.txt", "shared");
    fs.mkdirSync(path.join(local, "private"), { recursive: true });
    fs.writeFileSync(path.join(local, "private", "a.txt"), "local a");
    const result = executePlan(prunePlan(["private/a.txt", "private/sub/b.txt"]));
    expect(result.outcome).toBe("success");
    expect(result.actions).toEqual([
      { id: "a1", state: "completed" },
      { id: "a2", state: "completed" },
    ]);
    expect(result.recovery).toContain("Git history");
    expect(fs.existsSync(first)).toBe(false);
    expect(fs.existsSync(second)).toBe(false);
    expect(fs.readFileSync(sibling, "utf8")).toBe("shared");
    expect(fs.readFileSync(path.join(local, "private", "a.txt"), "utf8")).toBe("local a");
  });

  it("fails an action whose backup file changed mid-apply, keeps it, and skips later ones", () => {
    const first = backupFile("private/a.txt", "a");
    const second = backupFile("private/b.txt", "b");
    const third = backupFile("private/c.txt", "c");
    const result = executePlan(prunePlan(["private/a.txt", "private/b.txt", "private/c.txt"]), {
      beforeAction: (action) => {
        if (action.id === "a2") fs.writeFileSync(second, "changed during apply");
      },
    });
    expect(result.outcome).toBe("partial");
    expect(result.actions.map((action) => action.state)).toEqual([
      "completed",
      "failed",
      "not_attempted",
    ]);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "PLAN_STALE_TARGET", item: "omp:private/b.txt" }),
    ]);
    expect(fs.existsSync(first)).toBe(false);
    expect(fs.readFileSync(second, "utf8")).toBe("changed during apply");
    expect(fs.readFileSync(third, "utf8")).toBe("c");
  });

  it("does not need the local counterpart to match: a changed local file never blocks pruning the backup", () => {
    const file = backupFile("private/a.txt", "a");
    fs.mkdirSync(path.join(local, "private"), { recursive: true });
    fs.writeFileSync(path.join(local, "private", "a.txt"), "before");
    const plan = prunePlan(["private/a.txt"]);
    fs.writeFileSync(path.join(local, "private", "a.txt"), "edited locally after the preview");
    expect(executePlan(plan).outcome).toBe("success");
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readFileSync(path.join(local, "private", "a.txt"), "utf8")).toBe(
      "edited locally after the preview",
    );
  });

  it("fails an action when the shared policy changed after the plan was made", () => {
    const file = backupFile("private/a.txt", "a");
    const result = executePlan(prunePlan(["private/a.txt"]), {
      beforeAction: () =>
        fs.writeFileSync(
          path.join(repo, ".ai-sync", "manifest.json"),
          JSON.stringify({ ...manifest, entries: [{ ...manifest.entries[0], sync: true }] }),
        ),
    });
    expect(result.outcome).toBe("failed");
    expect(result.errors).toEqual([expect.objectContaining({ code: "PLAN_STALE_POLICY" })]);
    expect(fs.readFileSync(file, "utf8")).toBe("a");
  });

  it("still deletes when only a version label changed in the policy", () => {
    const file = backupFile("private/a.txt", "a");
    const relabelled = { ...manifest, entries: [{ ...manifest.entries[0], version: "7" }] };
    const result = executePlan(prunePlan(["private/a.txt"]), {
      beforeAction: () =>
        fs.writeFileSync(path.join(repo, ".ai-sync", "manifest.json"), JSON.stringify(relabelled)),
    });
    expect(result.outcome).toBe("success");
    expect(fs.existsSync(file)).toBe(false);
  });

  it("refuses to delete through a backup directory that became a symlink out of the root", () => {
    backupFile("private/a.txt", "a");
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "a.txt"), "outside");
    const plan = prunePlan(["private/a.txt"]);
    fs.rmSync(path.join(repo, ".omp", "private"), { recursive: true });
    fs.symlinkSync(outside, path.join(repo, ".omp", "private"));
    const result = executePlan(plan);
    expect(result.outcome).toBe("failed");
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "PATH_ESCAPE", item: "omp:private/a.txt" }),
    ]);
    expect(fs.readFileSync(path.join(outside, "a.txt"), "utf8")).toBe("outside");
  });

  it("reports a symlinked backup file as unsupported and keeps both the link and its target", () => {
    const target = path.join(dir, "elsewhere.txt");
    fs.writeFileSync(target, "elsewhere");
    const link = path.join(repo, ".omp", "private", "link.txt");
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link);
    const plan = prunePlan(["private/link.txt"]);
    at(plan.actions, 0).type = "skip";
    const result = executePlan(plan);
    expect(result.outcome).toBe("failed");
    expect(result.errors).toEqual([expect.objectContaining({ code: "SYMLINK_UNSUPPORTED" })]);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("elsewhere");
  });
});
