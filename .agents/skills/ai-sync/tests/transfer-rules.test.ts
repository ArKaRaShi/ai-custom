import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import type { RemoteIntegrationPreview } from "@/scripts/lib/git";
import type { ResolvedRoot } from "@/scripts/lib/manifest";
import { type Plan, type PlanAction, SyncError } from "@/scripts/lib/plan";
import {
  assemblePlan,
  assertReviewedScope,
  boundaryOf,
  checkedSides,
  dependentIncoming,
  directoryParts,
  ESCAPE_RECOVERY,
  escapeError,
  executionResult,
  gitNotes,
  gitStoppedResult,
  locationsFor,
  PRUNE_CAVEAT,
  previewResult,
  pullGitPlan,
  pullGitReport,
  removalActionType,
  staleItem,
  toActionError,
  transferActionType,
} from "@/scripts/lib/plan-rules";

const absent = { kind: "absent" } as const;
const file = { kind: "file", sha256: "a".repeat(64), mode: 0o644 } as const;
const link = { kind: "symlink", target: "/elsewhere" } as const;

function action(overrides: Partial<PlanAction> = {}): PlanAction {
  return {
    id: "a1",
    type: "copy",
    root: "rules",
    path: "sub/x.md",
    source: { location: "/home/u/rules/sub/x.md", digest: file },
    target: { location: "/repo/rules/sub/x.md", digest: absent },
    ...overrides,
  };
}

function plan(actions: PlanAction[], operation: Plan["operation"] = "push"): Plan {
  return assemblePlan({
    operation,
    repoBase: "/repo",
    headCommit: "abc",
    targets: ["rules"],
    exclude: [],
    actions,
    policyHash: "p",
    bindingsHash: "b",
  });
}

describe("given apply options, when assertReviewedScope runs, then only bounded targets pass", () => {
  it("refuses empty and unbounded targets with BROAD_SCOPE", () => {
    for (const targets of [undefined, [], ["**"], ["rules", "*"]]) {
      try {
        assertReviewedScope({ targets });
        throw new Error("expected BROAD_SCOPE");
      } catch (error) {
        expect(error).toBeInstanceOf(SyncError);
        expect(error instanceof SyncError ? error.errors[0]?.code : undefined).toBe("BROAD_SCOPE");
      }
    }
  });

  it("accepts bounded targets", () => {
    expect(() => assertReviewedScope({ targets: ["rules", "skills:foo"] })).not.toThrow();
  });
});

describe("given digests, when action types are chosen, then symlinks skip and prunes delete files only", () => {
  it("copies into an absent target, overwrites otherwise, skips symlinks", () => {
    expect(transferActionType(file, absent)).toBe("copy");
    expect(transferActionType(file, file)).toBe("overwrite");
    expect(transferActionType(link, absent)).toBe("skip");
    expect(transferActionType(file, link)).toBe("skip");
  });

  it("removes only regular backup files", () => {
    expect(removalActionType(file)).toBe("delete");
    expect(removalActionType(link)).toBe("skip");
    expect(removalActionType(absent)).toBe("skip");
  });
});

describe("given root-relative paths, when boundaries are derived, then the managed root and sides are recovered", () => {
  it("recovers the root directory from a location and its root-relative path", () => {
    expect(boundaryOf("/repo/rules/sub/x.md", "sub/x.md")).toBe("/repo/rules");
    expect(boundaryOf("/repo/AGENTS.md", "AGENTS.md")).toBe("/repo");
  });

  it("treats a single-file root as its own boundary", () => {
    expect(boundaryOf("/repo/single", "AGENTS.md")).toBe("/repo/single");
  });

  it("lists only directory components to inspect", () => {
    expect(directoryParts("a/b/c.md")).toEqual(["a", "b"]);
    expect(directoryParts("c.md")).toEqual([]);
  });

  it("checks only the backup side for a prune", () => {
    expect(checkedSides("prune")).toEqual(["target"]);
    expect(checkedSides("push")).toEqual(["source", "target"]);
    expect(checkedSides("pull")).toEqual(["source", "target"]);
  });

  it("formats a PATH_ESCAPE error naming each escaping side", () => {
    expect(escapeError(action(), ["source", "target"])).toEqual({
      code: "PATH_ESCAPE",
      item: "rules:sub/x.md",
      message:
        "The source and target of rules:sub/x.md runs through a symlinked directory that leaves its managed root.",
    });
    expect(ESCAPE_RECOVERY).toContain("symlinked directory");
  });
});

describe("given a resolved root, when locationsFor runs, then candidate locations are joined per side", () => {
  const dirRoot: ResolvedRoot = {
    id: "rules",
    kind: "path",
    local: "/home/u/rules",
    repo: "/repo/rules",
  };
  const fileRoot: ResolvedRoot = {
    id: "agents",
    kind: "path",
    local: "/home/u/AGENTS.md",
    repo: "/repo/agents",
  };

  it("joins a root-relative path under each side", () => {
    expect(locationsFor(dirRoot, "sub/x.md", "local")).toEqual([
      path.join("/home/u/rules", "sub", "x.md"),
    ]);
    expect(locationsFor(dirRoot, "sub/x.md", "repo")).toEqual([
      path.join("/repo/rules", "sub", "x.md"),
    ]);
  });

  it("also accepts the bare base for a path root bound to a single file", () => {
    expect(locationsFor(fileRoot, "AGENTS.md", "repo")).toEqual([
      path.join("/repo/agents", "AGENTS.md"),
      "/repo/agents",
    ]);
  });
});

describe("given a changed fingerprint, when staleItem runs, then the message shows planned and actual", () => {
  it("describes the planned and actual fingerprints", () => {
    const error = staleItem("PLAN_STALE_TARGET", action(), "target", file);
    expect(error.code).toBe("PLAN_STALE_TARGET");
    expect(error.item).toBe("rules:sub/x.md");
    expect(error.message).toBe(
      `Target /repo/rules/sub/x.md changed since the preview (absent -> file ${"a".repeat(12)}).`,
    );
  });
});

describe("given plan inputs, when assemblePlan runs, then scope is sorted and excludes are conditional", () => {
  it("snapshots scope with sorted unique roots and records excludes only when present", () => {
    const built = assemblePlan({
      operation: "pull",
      repoBase: "/repo",
      headCommit: null,
      targets: ["t"],
      exclude: ["*.tmp"],
      actions: [action({ id: "a1", root: "z" }), action({ id: "a2", root: "a", path: "y.md" })],
      policyHash: "p",
      bindingsHash: "b",
    });
    expect(built.scope).toEqual({
      roots: ["a", "z"],
      targets: ["t"],
      resolvedPaths: ["z:sub/x.md", "a:y.md"],
      exclude: ["*.tmp"],
    });
    expect(built.git).toBeNull();
    expect(plan([]).scope).not.toHaveProperty("exclude");
  });
});

describe("given thrown values, when toActionError runs, then a ResultError comes back", () => {
  it("keeps the first SyncError error and wraps anything else as IO_FAILED", () => {
    const first = { code: "PLAN_INVALID", item: "x", message: "bad" } as const;
    expect(toActionError(new SyncError([first]))).toEqual(first);
    expect(toActionError(new Error("boom"))).toEqual({
      code: "IO_FAILED",
      item: null,
      message: "boom",
    });
    expect(toActionError("text")).toEqual({ code: "IO_FAILED", item: null, message: "text" });
  });
});

describe("given executed actions, when executionResult runs, then outcome and recovery follow the flags", () => {
  const two = plan([action({ id: "a1" }), action({ id: "a2", path: "y.md" })]);

  it("succeeds with no recovery for a transfer and the caveat for a prune", () => {
    const done = [
      { id: "a1", state: "completed" },
      { id: "a2", state: "completed" },
    ] as const;
    const result = executionResult(two, [...done], [], { stopped: false, skipped: false });
    expect(result.outcome).toBe("success");
    expect(result.recovery).toBeNull();
    const pruned = executionResult({ ...two, operation: "prune" }, [...done], [], {
      stopped: false,
      skipped: false,
    });
    expect(pruned.recovery).toBe(PRUNE_CAVEAT);
  });

  it("is partial when something completed before the stop, failed otherwise", () => {
    const partial = executionResult(
      two,
      [
        { id: "a1", state: "completed" },
        { id: "a2", state: "failed", error: "x" },
      ],
      [{ code: "IO_FAILED", item: "rules:y.md", message: "x" }],
      { stopped: true, skipped: false },
    );
    expect(partial.outcome).toBe("partial");
    expect(partial.recovery).toBe(
      "Completed actions stay in place (no rollback). Run a fresh preview to plan the remaining changes.",
    );
    const failed = executionResult(
      { ...two, operation: "prune" },
      [
        { id: "a1", state: "failed", error: "x" },
        { id: "a2", state: "not_attempted" },
      ],
      [{ code: "PATH_ESCAPE", item: null, message: "x" }],
      { stopped: true, skipped: false },
    );
    expect(failed.outcome).toBe("failed");
    expect(failed.recovery).toBe(
      `Completed actions stay in place (no rollback). Run a fresh preview to plan the remaining changes. ${ESCAPE_RECOVERY} ${PRUNE_CAVEAT}`,
    );
  });

  it("explains skipped symlinks per operation when nothing stopped", () => {
    const skipped = [{ id: "a1", state: "not_attempted", error: "s" }] as const;
    const transfer = executionResult(plan([action()]), [...skipped], [], {
      stopped: false,
      skipped: true,
    });
    expect(transfer.outcome).toBe("failed");
    expect(transfer.recovery).toBe(
      "Replace symlinked files with regular files or exclude them, then preview again.",
    );
    const prune = executionResult(plan([action()], "prune"), [...skipped], [], {
      stopped: false,
      skipped: true,
    });
    expect(prune.recovery).toBe(
      "Remove symlinked backup copies yourself: ai-sync never follows or deletes symlinks. Then preview again.",
    );
  });
});

describe("given a plan, when preview and stopped results are built, then actions are proposed or not attempted", () => {
  it("proposes every action with review guidance, or nothing with no recovery", () => {
    const result = previewResult(plan([action()]));
    expect(result.outcome).toBe("preview");
    expect(result.actions).toEqual([{ id: "a1", state: "proposed" }]);
    expect(result.recovery).toBe(
      "Review the actions, then run `sync apply <plan-file> --apply` for a plan saved with --plan-out, or repeat the command with an explicit --target and --apply.",
    );
    expect(previewResult(plan([action()], "prune")).recovery?.endsWith(` ${PRUNE_CAVEAT}`)).toBe(
      true,
    );
    expect(previewResult(plan([])).recovery).toBeNull();
  });

  it("reports every action as not attempted and omits git when absent", () => {
    const stopped = gitStoppedResult(plan([action()]), [], "r");
    expect(stopped.outcome).toBe("failed");
    expect(stopped.actions).toEqual([{ id: "a1", state: "not_attempted" }]);
    expect(stopped).not.toHaveProperty("git");
    expect(gitStoppedResult(plan([]), [], "r", { remoteRef: "refs/heads/main" }).git).toEqual({
      remoteRef: "refs/heads/main",
    });
  });
});

describe("given a Git report, when gitNotes runs, then notes appear in a fixed order", () => {
  it("renders each Git fact in a fixed order", () => {
    expect(gitNotes(undefined)).toEqual([]);
    expect(
      gitNotes({
        remoteRef: "refs/heads/main",
        remoteCommit: "0123456789abcdef",
        incoming: [{ path: "a.md", action: "add" }],
        conflicts: ["c.md"],
        exportedPaths: ["x", "y"],
        unrelatedChanges: ["u"],
        limitation: "later",
      }),
    ).toEqual([
      "git remote refs/heads/main at 0123456789ab",
      "git incoming add: a.md",
      "git conflict: c.md",
      "git exports 2 path(s): x, y",
      "git unrelated changes: u",
      "git limitation: later",
    ]);
    expect(gitNotes({ unrelatedChanges: [] })).toEqual([]);
  });
});

describe("given a remote integration preview, when the pull review is built, then report and plan mirror it", () => {
  const preview: RemoteIntegrationPreview = {
    remoteUrlHash: "h",
    remoteRef: "refs/heads/main",
    remoteCommit: "c0ffee",
    localHead: "head",
    indexClean: true,
    worktreeClean: false,
    incoming: [{ path: "sub/rules/x.md", action: "modify" }],
    conflicts: [],
    blocked: null,
  };

  it("finds incoming paths that fall inside a managed root", () => {
    const roots = ["/work/sub/rules"];
    expect(dependentIncoming("sub/", "/work/sub", roots, preview.incoming)).toEqual([
      "sub/rules/x.md",
    ]);
    expect(dependentIncoming("sub/", "/work/sub", ["/work/sub/other"], preview.incoming)).toEqual(
      [],
    );
    expect(dependentIncoming("other/", "/work/sub", roots, preview.incoming)).toEqual([]);
  });

  it("builds the report and saved plan from a preview", () => {
    expect(pullGitReport(preview, ["u"], [])).toEqual({
      remoteRef: "refs/heads/main",
      remoteCommit: "c0ffee",
      incoming: preview.incoming,
      conflicts: [],
      unrelatedChanges: ["u"],
    });
    expect(pullGitReport(preview, [], ["a", "b"]).limitation).toBe(
      "The pull changes a, b, which restore actions read; the listed actions use the current backup files and the exact restore is determined after the pull.",
    );
    expect(
      pullGitReport({ ...preview, remoteRef: "", remoteCommit: "" }, [], []),
    ).not.toHaveProperty("remoteRef");
    expect(pullGitPlan(preview, ["u"])).toEqual({
      remoteUrlHash: "h",
      remoteRef: "refs/heads/main",
      remoteCommit: "c0ffee",
      localHead: "head",
      indexClean: true,
      worktreeClean: false,
      exportedPaths: [],
      unrelatedChanges: ["u"],
    });
  });
});
