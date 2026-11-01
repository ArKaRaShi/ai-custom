import { describe, expect, it } from "bun:test";
import {
  compareScan,
  diffReportOf,
  divergentFiles,
  statusResultOf,
  targetForPath,
} from "@/scripts/domain/diff";
import { inspectItem, inspectItems, inspectResultOf } from "@/scripts/domain/inspect";
import type { Locations, SyncEntry, UnifiedManifest } from "@/scripts/domain/manifest";
import { SyncError } from "@/scripts/domain/plan";
import type { ResolvedSyncTarget, ScanEntry, ScanResult } from "@/scripts/domain/scan";
import { matchesTarget } from "@/scripts/domain/targets";

const glob = (pattern: string, value: string): boolean => new Bun.Glob(pattern).match(value);
const test = (raw: string, candidate: Parameters<typeof matchesTarget>[1]): boolean =>
  matchesTarget(raw, candidate, glob);

const entries: SyncEntry[] = [
  { kind: "path", root: "rules", path: "*.md", sync: true, version: "1.0" },
  { kind: "path", root: "rules", path: "private.md", sync: false },
  { kind: "skill", root: "skills", path: "alpha", sync: true, skill: { origin: "authored" } },
];
const manifest: UnifiedManifest = {
  version: 2,
  roots: {
    rules: { kind: "path", repoRoot: "rules" },
    skills: { kind: "skill", repoRoot: "skills" },
  },
  entries,
};
const locations: Locations = { version: 1, roots: { rules: "/home/u/rules" } };

describe("given registered manifest entries and machine bindings, when inspecting, then items reflect policy, version, and local paths", () => {
  it("reports policy, version, and the bound local path", () => {
    const [path1, path2, skill] = entries;
    expect(inspectItem(path1 as SyncEntry, locations)).toEqual({
      kind: "path",
      root: "rules",
      path: "*.md",
      policy: "shared",
      local: "/home/u/rules/*.md",
      version: "1.0",
    });
    expect(inspectItem(path2 as SyncEntry, locations)).toMatchObject({
      policy: "local-only",
      version: null,
    });
    expect(inspectItem(skill as SyncEntry, locations)).toEqual({
      kind: "skill",
      root: "skills",
      path: "alpha",
      policy: "shared",
      local: null,
      version: null,
      origin: "authored",
      source: null,
      install: null,
    });
  });

  it("selects by target and returns unknown targets", () => {
    expect(inspectItems(manifest, locations, [], test).items).toHaveLength(3);
    const byRoot = inspectItems(manifest, locations, ["rules"], test);
    expect(byRoot.items.map((item) => item.path)).toEqual(["*.md", "private.md"]);
    const bySkill = inspectItems(manifest, locations, ["alpha", "nope"], test);
    expect(bySkill.items.map((item) => item.path)).toEqual(["alpha"]);
    expect(bySkill.unknown).toEqual(["nope"]);
  });

  it("builds the inspect envelope with sorted roots", () => {
    const { items } = inspectItems(manifest, locations, [], test);
    const result = inspectResultOf(items);
    expect(result.operation).toBe("inspect");
    expect(result.scope.roots).toEqual(["rules", "skills"]);
    expect(result.scope.resolvedPaths).toHaveLength(3);
    expect(result.items).toBe(items);
  });
});

const scanEntry = (state: ScanEntry["state"], name: string, root = "rules"): ScanEntry => ({
  root,
  path: name,
  local: `/l/${name}`,
  repo: `/r/${name}`,
  state,
});

const scanned = (list: ScanEntry[]): ScanResult => ({
  manifest,
  roots: [{ id: "rules", kind: "path", local: "/l", repo: "/r" }],
  entries: list,
  itemNames: [],
});

describe("given scan entries and sync targets, when comparing, then drift is bucketed and paired by path", () => {
  const syncTarget = (local: string, repo: string): ResolvedSyncTarget => ({
    local,
    repo,
    name: "rules",
    category: "rules",
    rootId: "rules",
    entries: [],
  });

  it("finds the target containing a path, never the target itself or a sibling", () => {
    const targets = [syncTarget("/l/a", "/r/a"), syncTarget("/l/b", "/r/b")];
    expect(targetForPath(targets, "/l/b/x/y.md", "local")?.relative).toBe("x/y.md");
    expect(targetForPath(targets, "/r/a/z.md", "repo")?.target).toBe(targets[0]);
    expect(targetForPath(targets, "/l/a", "local")).toBeUndefined();
    expect(targetForPath(targets, "/l/ab/x.md", "local")).toBeUndefined();
  });

  it("buckets entries by drift state", () => {
    const report = diffReportOf([
      scanEntry("in_sync", "a"),
      scanEntry("modified", "b"),
      scanEntry("new_local", "c"),
      scanEntry("new_repo", "d"),
    ]);
    expect(report).toEqual({
      missingInRepo: ["/l/c"],
      missingInLocal: ["/r/d"],
      modified: ["/l/b"],
      inSync: 1,
    });
  });

  it("narrows by targets and throws UNKNOWN_TARGET for unmatched ones", () => {
    const scan = scanned([scanEntry("modified", "a.md"), scanEntry("modified", "b.md")]);
    expect(compareScan(scan, ["a.md"], test).modified).toEqual(["/l/a.md"]);
    expect(compareScan(scan, [], test).modified).toHaveLength(2);
    try {
      compareScan(scan, ["missing.md"], test);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(SyncError);
      expect((error as SyncError).errors[0]?.code).toBe("UNKNOWN_TARGET");
    }
  });

  it("pairs modified files with their backup path and skips files outside every target", () => {
    const targets = [syncTarget("/l", "/r")];
    const files = divergentFiles(
      {
        missingInRepo: [],
        missingInLocal: [],
        modified: ["/l/sub/a.md", "/elsewhere/b.md"],
        inSync: 0,
      },
      targets,
    );
    expect(files).toEqual([{ relative: "sub/a.md", local: "/l/sub/a.md", repo: "/r/sub/a.md" }]);
  });

  it("builds the status envelope from drifting entries only", () => {
    const clean = statusResultOf([scanEntry("in_sync", "a")]);
    expect(clean.recovery).toBeNull();
    expect(clean.scope.resolvedPaths).toEqual([]);
    const drift = statusResultOf([
      scanEntry("in_sync", "a"),
      scanEntry("new_local", "b", "skills"),
      scanEntry("modified", "c"),
    ]);
    expect(drift.operation).toBe("status");
    expect(drift.scope.roots).toEqual(["rules", "skills"]);
    expect(drift.scope.resolvedPaths).toHaveLength(2);
    expect(drift.recovery).toBe("Run push or pull to preview the transfer.");
  });
});
