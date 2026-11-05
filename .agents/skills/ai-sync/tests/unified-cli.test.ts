import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { InspectItem, Plan, Result } from "@/scripts/lib/plan";
import { at } from "./helpers/at";

const tempDirs: string[] = [];
const cliPath = path.join(import.meta.dir, "../scripts/sync.ts");

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-cli-v2-"));
  tempDirs.push(dir);
  return dir;
}

interface RunOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function run(home: string, repo: string, ...args: string[]): RunOutput {
  const result = Bun.spawnSync(["bun", cliPath, ...args], {
    env: { ...process.env, HOME: home, AI_CUSTOM_REPO: repo },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("given unified sync CLI, when root and tracking commands are invoked, then applies shared policy", () => {
  it("stores shared root policy separately from machine-local binding", () => {
    const home = tempDir();
    const repo = tempDir();
    const local = path.join(home, "custom-omp");
    expect(
      run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp").exitCode,
    ).toBe(0);
    expect(run(home, repo, "root", "bind", "omp", "--local-root", local).exitCode).toBe(0);
    const shared = JSON.parse(
      fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"),
    );
    const locations = JSON.parse(
      fs.readFileSync(path.join(home, ".config", "ai-sync", "locations.json"), "utf8"),
    );
    expect(shared.roots.omp).toEqual({ kind: "path", repoRoot: ".omp" });
    expect(locations.roots.omp).toBe(local);
    expect(shared.roots.omp).not.toHaveProperty("localRoot");
  });

  it("tracks scoped path rules and skills without conflating their identity", () => {
    const home = tempDir();
    const repo = tempDir();
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(
      home,
      repo,
      "track",
      "skill",
      "tool",
      "--root",
      "agents",
      "--origin",
      "external",
      "--from",
      "org/tool",
      "--no-sync",
    );
    const shared = JSON.parse(
      fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"),
    );
    expect(shared.entries).toContainEqual({
      kind: "skill",
      root: "agents",
      path: "tool",
      sync: false,
      skill: { origin: "external", source: "org/tool" },
    });
  });

  it("fails closed when transfer commands lack a required root binding", () => {
    const home = tempDir();
    const repo = tempDir();
    run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
    const result = run(home, repo, "push");
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/missing local root binding: omp/i);
  });

  it("pushes only files allowed by ordered root-scoped rules", () => {
    const home = tempDir();
    const repo = tempDir();
    const local = path.join(home, "omp");
    fs.mkdirSync(path.join(local, "extensions", "private"), { recursive: true });
    fs.writeFileSync(path.join(local, "extensions", "kept.ts"), "kept");
    fs.writeFileSync(path.join(local, "extensions", "private", "local.ts"), "private");
    fs.writeFileSync(path.join(local, "unlisted.ts"), "unlisted");
    run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
    run(home, repo, "root", "bind", "omp", "--local-root", local);
    run(home, repo, "track", "path", "extensions/**", "--root", "omp");
    run(home, repo, "untrack", "path", "extensions/private/**", "--root", "omp");
    const policy = JSON.parse(
      fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"),
    );
    expect(policy.entries).toHaveLength(2);
    const locations = JSON.parse(
      fs.readFileSync(path.join(home, ".config", "ai-sync", "locations.json"), "utf8"),
    );
    expect(locations.roots.omp).toBe(local);
    const status = run(home, repo, "status");
    expect(status.stdout).toContain("new_local    1 files");
    const push = run(home, repo, "push", "--apply", "--target", "omp");
    expect(push.stdout).toContain("backup complete");
    expect(fs.readFileSync(path.join(repo, ".omp", "extensions", "kept.ts"), "utf8")).toBe("kept");
    expect(fs.existsSync(path.join(repo, ".omp", "extensions", "private", "local.ts"))).toBe(false);
    expect(fs.existsSync(path.join(repo, ".omp", "unlisted.ts"))).toBe(false);
  });

  it("pulls equal skill names from separate roots into their machine-specific locations", () => {
    const home = tempDir();
    const repo = tempDir();
    const agents = path.join(home, "agents");
    const claude = path.join(home, "claude");
    fs.mkdirSync(path.join(repo, ".agents", "skills", "tool"), { recursive: true });
    fs.mkdirSync(path.join(repo, ".claude", "skills", "tool"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".agents", "skills", "tool", "source.txt"), "agent");
    fs.writeFileSync(path.join(repo, ".claude", "skills", "tool", "source.txt"), "claude");
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(home, repo, "root", "add", "claude", "--kind", "skill", "--repo-root", ".claude/skills");
    run(home, repo, "root", "bind", "agents", "--local-root", agents);
    run(home, repo, "root", "bind", "claude", "--local-root", claude);
    run(home, repo, "track", "skill", "tool", "--root", "agents", "--origin", "authored", "--sync");
    run(home, repo, "track", "skill", "tool", "--root", "claude", "--origin", "external", "--sync");
    expect(
      run(home, repo, "pull", "--apply", "--target", "agents", "--target", "claude").exitCode,
    ).toBe(0);
    expect(fs.readFileSync(path.join(agents, "tool", "source.txt"), "utf8")).toBe("agent");
    expect(fs.readFileSync(path.join(claude, "tool", "source.txt"), "utf8")).toBe("claude");
  });
});

it("reports and preserves a repo skill copy when sync is disabled", () => {
  const home = tempDir();
  const repo = tempDir();
  const local = path.join(home, "skills");
  const backup = path.join(repo, ".agents", "skills", "authored");
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, "SKILL.md"), "existing");
  run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
  run(home, repo, "root", "bind", "agents", "--local-root", local);
  run(
    home,
    repo,
    "track",
    "skill",
    "authored",
    "--root",
    "agents",
    "--origin",
    "authored",
    "--sync",
  );
  const result = run(
    home,
    repo,
    "track",
    "skill",
    "authored",
    "--root",
    "agents",
    "--origin",
    "authored",
    "--no-sync",
  );
  expect(result.stdout).toContain(".agents/skills/authored");
  expect(fs.readFileSync(path.join(backup, "SKILL.md"), "utf8")).toBe("existing");
  run(home, repo, "untrack", "skill", "authored", "--root", "agents");
  expect(fs.readFileSync(path.join(backup, "SKILL.md"), "utf8")).toBe("existing");
});

it("discovery reports unlisted paths and writes them as local-only", () => {
  const home = tempDir();
  const repo = tempDir();
  const local = path.join(home, "omp");
  fs.mkdirSync(local, { recursive: true });
  fs.writeFileSync(path.join(local, "private.yml"), "secret");
  run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
  run(home, repo, "root", "bind", "omp", "--local-root", local);
  expect(run(home, repo, "discover").stdout).toContain("omp:private.yml");
  expect(run(home, repo, "discover", "--write").exitCode).toBe(0);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"),
  );
  expect(manifest.entries).toContainEqual({
    kind: "path",
    root: "omp",
    path: "private.yml",
    sync: false,
  });
  const again = run(home, repo, "discover", "--write");
  expect(again.stderr).toBe("");
  expect(again.exitCode).toBe(0);
  expect(
    JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8")).entries,
  ).toHaveLength(1);
});

interface Fixture {
  home: string;
  repo: string;
  local: string;
  out: string;
}

/** A path root `omp` bound to `home/omp`, tracking `*.txt`, with a.txt, b.txt, and sub/c.txt local. */
function fixture(): Fixture {
  const home = tempDir();
  const repo = tempDir();
  const out = tempDir();
  const local = path.join(home, "omp");
  fs.mkdirSync(path.join(local, "sub"), { recursive: true });
  fs.writeFileSync(path.join(local, "a.txt"), "a");
  fs.writeFileSync(path.join(local, "b.txt"), "b");
  fs.writeFileSync(path.join(local, "sub", "c.txt"), "c");
  run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
  run(home, repo, "root", "bind", "omp", "--local-root", local);
  run(home, repo, "track", "path", "*.txt", "--root", "omp");
  return { home, repo, local, out };
}

function result(run1: { stdout: string }): Result {
  return JSON.parse(run1.stdout) as Result;
}

function codes(value: Result): string[] {
  return value.errors.map((error) => error.code);
}

function repoFile(f: Fixture, ...parts: string[]): string {
  return path.join(f.repo, ".omp", ...parts);
}

describe("given explicit targets, when previewing and applying, then results use the JSON envelope and unsafe scopes are rejected", () => {
  it("reports status as an envelope whose resolved paths are the drifting files", () => {
    const f = fixture();
    const status = run(f.home, f.repo, "status", "--format=json");
    expect(status.exitCode).toBe(0);
    const value = result(status);
    expect(value).toEqual({
      operation: "status",
      scope: { roots: ["omp"], resolvedPaths: ["omp:a.txt", "omp:b.txt", "omp:sub/c.txt"] },
      actions: [],
      outcome: "success",
      errors: [],
      recovery: "Run push or pull to preview the transfer.",
    });
  });

  it("previews push as proposed actions aligned with resolved paths and writes nothing", () => {
    const f = fixture();
    const preview = run(f.home, f.repo, "push", "--target", "omp", "--format=json");
    expect(preview.exitCode).toBe(0);
    const value = result(preview);
    expect(value.operation).toBe("push");
    expect(value.outcome).toBe("preview");
    expect(value.scope.resolvedPaths).toEqual(["omp:a.txt", "omp:b.txt", "omp:sub/c.txt"]);
    expect(value.actions).toEqual([
      { id: "a1", state: "proposed" },
      { id: "a2", state: "proposed" },
      { id: "a3", state: "proposed" },
    ]);
    expect(value.errors).toEqual([]);
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
  });

  it("keeps the human tree output for previews", () => {
    const f = fixture();
    const preview = run(f.home, f.repo, "push", "--target", "omp");
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain("ai-sync:push [preview]");
    expect(preview.stdout).toContain("omp:a.txt");
    expect(preview.stdout).toContain("preview only");
  });

  it("rejects an unknown target with UNKNOWN_TARGET and a nonzero exit", () => {
    const f = fixture();
    const failed = run(f.home, f.repo, "push", "--target", "nope", "--format=json");
    expect(failed.exitCode).not.toBe(0);
    const value = result(failed);
    expect(value.outcome).toBe("failed");
    expect(value.errors).toEqual([
      expect.objectContaining({ code: "UNKNOWN_TARGET", item: "nope" }),
    ]);
    expect(value.actions).toEqual([]);
  });

  it("no longer treats a target as a loose substring", () => {
    const f = fixture();
    const failed = run(f.home, f.repo, "push", "--target", "a.t", "--format=json");
    expect(failed.exitCode).not.toBe(0);
    expect(codes(result(failed))).toEqual(["UNKNOWN_TARGET"]);
  });

  it("reports unknown targets on stderr in tree mode", () => {
    const f = fixture();
    const failed = run(f.home, f.repo, "push", "--target", "nope");
    expect(failed.exitCode).not.toBe(0);
    expect(failed.stderr).toContain("UNKNOWN_TARGET");
  });

  it("selects by exact path, root-qualified path, and glob, and reports the resolved paths", () => {
    const f = fixture();
    const exact = result(run(f.home, f.repo, "push", "--target", "a.txt", "--format=json"));
    expect(exact.scope.resolvedPaths).toEqual(["omp:a.txt"]);
    const missing = result(
      run(f.home, f.repo, "push", "--target", "omp:nothing.txt", "--format=json"),
    );
    expect(codes(missing)).toEqual(["UNKNOWN_TARGET"]);
    const qualified = result(
      run(f.home, f.repo, "push", "--target", "omp:sub/c.txt", "--format=json"),
    );
    expect(qualified.scope.resolvedPaths).toEqual(["omp:sub/c.txt"]);
    const glob = result(run(f.home, f.repo, "push", "--target", "sub/*", "--format=json"));
    expect(glob.scope.resolvedPaths).toEqual(["omp:sub/c.txt"]);
    const dir = result(run(f.home, f.repo, "push", "--target", "sub", "--format=json"));
    expect(dir.scope.resolvedPaths).toEqual(["omp:sub/c.txt"]);
    const repeated = result(
      run(f.home, f.repo, "push", "--target", "b.txt", "--target", "a.txt", "--format=json"),
    );
    expect(repeated.scope.resolvedPaths).toEqual(["omp:a.txt", "omp:b.txt"]);
  });

  it("rejects a selection with nothing to change as EMPTY_SCOPE", () => {
    const f = fixture();
    expect(run(f.home, f.repo, "push", "--apply", "--target", "a.txt").exitCode).toBe(0);
    const empty = run(f.home, f.repo, "push", "--target", "a.txt", "--format=json");
    expect(empty.exitCode).not.toBe(0);
    expect(codes(result(empty))).toEqual(["EMPTY_SCOPE"]);
    const emptyApply = run(f.home, f.repo, "push", "--apply", "--target", "a.txt", "--format=json");
    expect(emptyApply.exitCode).not.toBe(0);
    expect(codes(result(emptyApply))).toEqual(["EMPTY_SCOPE"]);
  });

  it("does not treat an in-sync untargeted preview as an error", () => {
    const f = fixture();
    expect(run(f.home, f.repo, "push", "--apply", "--target", "omp").exitCode).toBe(0);
    const preview = run(f.home, f.repo, "push");
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain("nothing to export");
  });

  it("refuses to apply without an explicit target (BROAD_SCOPE) and leaves the backup untouched", () => {
    const f = fixture();
    const untargeted = run(f.home, f.repo, "push", "--apply", "--format=json");
    expect(untargeted.exitCode).not.toBe(0);
    expect(codes(result(untargeted))).toEqual(["BROAD_SCOPE"]);
    const wildcard = run(f.home, f.repo, "push", "--apply", "--target", "**", "--format=json");
    expect(wildcard.exitCode).not.toBe(0);
    expect(codes(result(wildcard))).toEqual(["BROAD_SCOPE"]);
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
    expect(run(f.home, f.repo, "pull", "--apply", "--format=json").exitCode).not.toBe(0);
  });

  it("applies only the explicit target and reports completed actions", () => {
    const f = fixture();
    const applied = run(f.home, f.repo, "push", "--apply", "--target", "a.txt", "--format=json");
    expect(applied.exitCode).toBe(0);
    const value = result(applied);
    expect(value.outcome).toBe("success");
    expect(value.actions).toEqual([{ id: "a1", state: "completed" }]);
    expect(value.scope.resolvedPaths).toEqual(["omp:a.txt"]);
    expect(fs.readFileSync(repoFile(f, "a.txt"), "utf8")).toBe("a");
    expect(fs.existsSync(repoFile(f, "b.txt"))).toBe(false);
  });

  it("reports a backup that is not a Git repository as GIT_FAILED in preview and apply, and restores nothing", () => {
    const f = fixture();
    fs.mkdirSync(repoFile(f), { recursive: true });
    fs.writeFileSync(repoFile(f, "d.txt"), "from repo");
    const preview = run(f.home, f.repo, "pull", "--target", "d.txt", "--git-pull", "--format=json");
    expect(preview.exitCode).not.toBe(0);
    expect(result(preview).outcome).toBe("failed");
    expect(codes(result(preview))).toEqual(["GIT_FAILED"]);
    expect(result(preview).actions.every((action) => action.state === "not_attempted")).toBe(true);
    const applied = run(
      f.home,
      f.repo,
      "pull",
      "--apply",
      "--target",
      "d.txt",
      "--git-pull",
      "--format=json",
    );
    expect(applied.exitCode).not.toBe(0);
    expect(codes(result(applied))).toEqual(["GIT_FAILED"]);
    expect(fs.existsSync(path.join(f.local, "d.txt"))).toBe(false);
  });
});

describe("given a saved change plan, when it is applied, then stale or invalid plans are rejected without mutation", () => {
  function plan(
    f: Fixture,
    operation: "push" | "pull",
    ...extra: string[]
  ): { file: string; run: RunOutput } {
    const file = path.join(f.out, `${operation}.plan.json`);
    return { file, run: run(f.home, f.repo, operation, "--plan-out", file, ...extra) };
  }

  it("writes a version 1 plan with digests, an absent target marker, and hashes", () => {
    const f = fixture();
    const saved = plan(f, "push", "--target", "a.txt");
    expect(saved.run.exitCode).toBe(0);
    const value = JSON.parse(fs.readFileSync(saved.file, "utf8")) as Plan;
    expect(value.version).toBe(1);
    expect(value.operation).toBe("push");
    expect(value.repository.path).toBe(path.resolve(f.repo));
    expect(value.scope).toEqual({
      roots: ["omp"],
      targets: ["a.txt"],
      resolvedPaths: ["omp:a.txt"],
    });
    expect(value.policyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(value.bindingsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(value.git).toBeNull();
    expect(value.actions).toHaveLength(1);
    const action = at(value.actions, 0);
    expect(action.id).toBe("a1");
    expect(action.type).toBe("copy");
    expect(action.source).toEqual({
      location: path.join(f.local, "a.txt"),
      digest: {
        kind: "file",
        sha256: createHash("sha256").update("a").digest("hex"),
        mode: expect.any(Number),
      },
    });
    expect(action.target).toEqual({ location: repoFile(f, "a.txt"), digest: { kind: "absent" } });
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
    expect(saved.run.stdout).toContain(saved.file);
  });

  it("writes no plan file when --plan-out is omitted", () => {
    const f = fixture();
    expect(run(f.home, f.repo, "push", "--target", "a.txt").exitCode).toBe(0);
    expect(fs.readdirSync(f.out)).toEqual([]);
  });

  it("refuses a plan file inside the backup or a managed root", () => {
    const f = fixture();
    for (const inside of [path.join(f.repo, "plan.json"), path.join(f.local, "plan.json")]) {
      const failed = run(
        f.home,
        f.repo,
        "push",
        "--target",
        "a.txt",
        "--plan-out",
        inside,
        "--format=json",
      );
      expect(failed.exitCode).not.toBe(0);
      expect(codes(result(failed))).toEqual(["PATH_ESCAPE"]);
      expect(fs.existsSync(inside)).toBe(false);
    }
  });

  it("round-trips: apply without --apply only verifies, apply --apply executes", () => {
    const f = fixture();
    const saved = plan(f, "push", "--target", "omp");
    const check = run(f.home, f.repo, "apply", saved.file, "--format=json");
    expect(check.exitCode).toBe(0);
    expect(result(check).outcome).toBe("preview");
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);

    const applied = run(f.home, f.repo, "apply", saved.file, "--apply", "--format=json");
    expect(applied.exitCode).toBe(0);
    const value = result(applied);
    expect(value.operation).toBe("push");
    expect(value.outcome).toBe("success");
    expect(value.actions).toEqual([
      { id: "a1", state: "completed" },
      { id: "a2", state: "completed" },
      { id: "a3", state: "completed" },
    ]);
    expect(fs.readFileSync(repoFile(f, "sub", "c.txt"), "utf8")).toBe("c");
    expect(fs.readFileSync(repoFile(f, "a.txt"), "utf8")).toBe("a");
    expect(fs.readFileSync(repoFile(f, "b.txt"), "utf8")).toBe("b");
  });

  it("applies a saved plan on the broad scope that a direct apply refuses", () => {
    const f = fixture();
    const saved = plan(f, "push");
    expect(saved.run.exitCode).toBe(0);
    expect(run(f.home, f.repo, "apply", saved.file, "--apply").exitCode).toBe(0);
    expect(fs.existsSync(repoFile(f, "b.txt"))).toBe(true);
  });

  it("round-trips a pull plan into the machine-local root", () => {
    const f = fixture();
    fs.mkdirSync(repoFile(f), { recursive: true });
    fs.writeFileSync(repoFile(f, "d.txt"), "from repo");
    const saved = plan(f, "pull", "--target", "d.txt");
    const value = JSON.parse(fs.readFileSync(saved.file, "utf8")) as Plan;
    expect(at(value.actions, 0).type).toBe("copy");
    expect(at(value.actions, 0).target.digest).toEqual({ kind: "absent" });
    expect(run(f.home, f.repo, "apply", saved.file, "--apply").exitCode).toBe(0);
    expect(fs.readFileSync(path.join(f.local, "d.txt"), "utf8")).toBe("from repo");
  });

  it("rejects a plan that was already applied because its targets changed", () => {
    const f = fixture();
    const saved = plan(f, "push", "--target", "a.txt");
    expect(run(f.home, f.repo, "apply", saved.file, "--apply").exitCode).toBe(0);
    const again = run(f.home, f.repo, "apply", saved.file, "--apply", "--format=json");
    expect(again.exitCode).not.toBe(0);
    expect(codes(result(again))).toEqual(["PLAN_STALE_TARGET"]);
  });

  it("rejects a stale source with zero mutation", () => {
    const f = fixture();
    const saved = plan(f, "push", "--target", "omp");
    fs.writeFileSync(path.join(f.local, "b.txt"), "b changed");
    const stale = run(f.home, f.repo, "apply", saved.file, "--apply", "--format=json");
    expect(stale.exitCode).not.toBe(0);
    const value = result(stale);
    expect(value.outcome).toBe("failed");
    expect(codes(value)).toEqual(["PLAN_STALE_SOURCE"]);
    expect(at(value.errors, 0).item).toBe("omp:b.txt");
    expect(value.actions).toEqual([
      { id: "a1", state: "not_attempted" },
      { id: "a2", state: "not_attempted" },
      { id: "a3", state: "not_attempted" },
    ]);
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
    expect(fs.existsSync(repoFile(f, "b.txt"))).toBe(false);
  });

  it("rejects a stale target, including a previously absent one, with zero mutation", () => {
    const f = fixture();
    fs.mkdirSync(repoFile(f), { recursive: true });
    fs.writeFileSync(repoFile(f, "a.txt"), "old backup");
    const saved = plan(f, "push", "--target", "omp");
    fs.writeFileSync(repoFile(f, "a.txt"), "someone else changed it");
    fs.writeFileSync(repoFile(f, "b.txt"), "appeared after the preview");
    const stale = run(f.home, f.repo, "apply", saved.file, "--apply", "--format=json");
    expect(stale.exitCode).not.toBe(0);
    const value = result(stale);
    expect(codes(value)).toEqual(["PLAN_STALE_TARGET", "PLAN_STALE_TARGET"]);
    expect(value.errors.map((error) => error.item)).toEqual(["omp:a.txt", "omp:b.txt"]);
    expect(fs.readFileSync(repoFile(f, "a.txt"), "utf8")).toBe("someone else changed it");
    expect(fs.readFileSync(repoFile(f, "b.txt"), "utf8")).toBe("appeared after the preview");
  });

  it("rejects a changed shared policy or machine binding with zero mutation", () => {
    const f = fixture();
    const saved = plan(f, "push", "--target", "omp");
    run(f.home, f.repo, "untrack", "path", "*.txt", "--root", "omp");
    run(f.home, f.repo, "track", "path", "*.txt", "--root", "omp", "--no-sync");
    const policy = run(f.home, f.repo, "apply", saved.file, "--apply", "--format=json");
    expect(policy.exitCode).not.toBe(0);
    expect(codes(result(policy))).toEqual(["PLAN_STALE_POLICY"]);
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);

    const rebound = fixture();
    const savedRebound = plan(rebound, "push", "--target", "omp");
    const moved = path.join(rebound.home, "moved");
    fs.cpSync(rebound.local, moved, { recursive: true });
    run(rebound.home, rebound.repo, "root", "bind", "omp", "--local-root", moved);
    const binding = run(
      rebound.home,
      rebound.repo,
      "apply",
      savedRebound.file,
      "--apply",
      "--format=json",
    );
    expect(binding.exitCode).not.toBe(0);
    expect(codes(result(binding))).toEqual(["PLAN_STALE_POLICY"]);
    expect(fs.existsSync(repoFile(rebound, "a.txt"))).toBe(false);
  });

  it("rejects a scope that gained or lost files with zero mutation", () => {
    const f = fixture();
    const saved = plan(f, "push", "--target", "omp");
    fs.writeFileSync(path.join(f.local, "new.txt"), "new");
    const grown = run(f.home, f.repo, "apply", saved.file, "--apply", "--format=json");
    expect(grown.exitCode).not.toBe(0);
    const value = result(grown);
    expect(codes(value)).toEqual(["PLAN_STALE_SCOPE"]);
    expect(at(value.errors, 0).item).toBe("omp:new.txt");
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
  });

  it("rejects selection flags and malformed plans without mutation", () => {
    const f = fixture();
    const saved = plan(f, "push", "--target", "omp");
    const flagged = run(
      f.home,
      f.repo,
      "apply",
      saved.file,
      "--apply",
      "--target",
      "a.txt",
      "--format=json",
    );
    expect(flagged.exitCode).not.toBe(0);
    expect(codes(result(flagged))).toEqual(["PLAN_INVALID"]);

    const garbage = path.join(f.out, "garbage.json");
    fs.writeFileSync(garbage, "not json");
    const unreadable = run(f.home, f.repo, "apply", garbage, "--apply", "--format=json");
    expect(unreadable.exitCode).not.toBe(0);
    expect(codes(result(unreadable))).toEqual(["PLAN_INVALID"]);

    const tampered = JSON.parse(fs.readFileSync(saved.file, "utf8")) as Plan;
    at(tampered.actions, 0).target.location = path.join(f.out, "elsewhere.txt");
    const redirected = path.join(f.out, "redirected.json");
    fs.writeFileSync(redirected, JSON.stringify(tampered));
    const wrongLocation = run(f.home, f.repo, "apply", redirected, "--apply", "--format=json");
    expect(wrongLocation.exitCode).not.toBe(0);
    expect(codes(result(wrongLocation))).toEqual(["PLAN_INVALID"]);

    const escaping = JSON.parse(fs.readFileSync(saved.file, "utf8")) as Plan;
    at(escaping.actions, 0).path = "../outside.txt";
    escaping.scope.resolvedPaths[0] = "omp:../outside.txt";
    const escapePlan = path.join(f.out, "escape.json");
    fs.writeFileSync(escapePlan, JSON.stringify(escaping));
    const escaped = run(f.home, f.repo, "apply", escapePlan, "--apply", "--format=json");
    expect(escaped.exitCode).not.toBe(0);
    expect(codes(result(escaped))).toEqual(["PATH_ESCAPE"]);
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
  });

  it("cannot combine --plan-out with --apply", () => {
    const f = fixture();
    const combined = run(
      f.home,
      f.repo,
      "push",
      "--apply",
      "--target",
      "a.txt",
      "--plan-out",
      path.join(f.out, "x.json"),
      "--format=json",
    );
    expect(combined.exitCode).not.toBe(0);
    expect(codes(result(combined))).toEqual(["PLAN_INVALID"]);
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
  });

  it("reports stale plans on stderr in tree mode", () => {
    const f = fixture();
    const saved = plan(f, "push", "--target", "a.txt");
    fs.writeFileSync(path.join(f.local, "a.txt"), "changed");
    const stale = run(f.home, f.repo, "apply", saved.file, "--apply");
    expect(stale.exitCode).not.toBe(0);
    expect(stale.stderr).toContain("PLAN_STALE_SOURCE");
  });
});

type Inspected = Result & { items: InspectItem[] };

function inspected(output: { stdout: string }): Inspected {
  return JSON.parse(output.stdout) as Inspected;
}

function manifestText(repo: string): string {
  return fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8");
}

/** Every regular file under `dir`, keyed by relative path, for before/after comparison. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(dir, full)] = fs.readFileSync(full, "utf8");
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return files;
}

interface Registered {
  home: string;
  repo: string;
  omp: string;
  skills: string;
}

/**
 * One machine with a shared file (config.yml, version 1.0), an unversioned shared tree (notes/**),
 * a local-only tree (private/**), an authored shared skill, and an external local-only skill.
 */
function registered(): Registered {
  const home = tempDir();
  const repo = tempDir();
  const omp = path.join(home, "omp");
  const skills = path.join(home, "skills");
  fs.mkdirSync(path.join(omp, "private"), { recursive: true });
  fs.mkdirSync(path.join(omp, "notes"), { recursive: true });
  fs.mkdirSync(path.join(skills, "mine"), { recursive: true });
  fs.writeFileSync(path.join(omp, "config.yml"), "shared config");
  fs.writeFileSync(path.join(omp, "notes", "n.md"), "note");
  fs.writeFileSync(path.join(omp, "private", "token.txt"), "local secret");
  fs.writeFileSync(path.join(skills, "mine", "SKILL.md"), "mine");
  run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
  run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
  run(home, repo, "root", "bind", "omp", "--local-root", omp);
  run(home, repo, "root", "bind", "agents", "--local-root", skills);
  run(home, repo, "track", "path", "config.yml", "--root", "omp", "--version", "1.0");
  run(home, repo, "track", "path", "notes/**", "--root", "omp");
  run(home, repo, "track", "path", "private/**", "--root", "omp", "--no-sync");
  run(home, repo, "track", "skill", "mine", "--root", "agents", "--origin", "authored", "--sync");
  run(
    home,
    repo,
    "track",
    "skill",
    "vendor",
    "--root",
    "agents",
    "--origin",
    "external",
    "--from",
    "org/vendor",
    "--install",
    "echo vendor",
    "--no-sync",
  );
  return { home, repo, omp, skills };
}

describe("given registered shared and local-only items, when inspected, then agents get a structured read-only result (AC-04)", () => {
  it("lists every item with kind, root, path, policy, version label or null, and the locally resolved path", () => {
    const m = registered();
    const output = run(m.home, m.repo, "inspect", "--format=json");
    expect(output.exitCode).toBe(0);
    const value = inspected(output);
    expect(value.operation).toBe("inspect");
    expect(value.outcome).toBe("success");
    expect(value.actions).toEqual([]);
    expect(value.errors).toEqual([]);
    expect(value.scope).toEqual({
      roots: ["agents", "omp"],
      resolvedPaths: [
        "omp:config.yml",
        "omp:notes/**",
        "omp:private/**",
        "agents:mine",
        "agents:vendor",
      ],
    });
    expect(value.items).toEqual([
      {
        kind: "path",
        root: "omp",
        path: "config.yml",
        policy: "shared",
        version: "1.0",
        local: path.join(m.omp, "config.yml"),
      },
      {
        kind: "path",
        root: "omp",
        path: "notes/**",
        policy: "shared",
        version: null,
        local: path.join(m.omp, "notes/**"),
      },
      {
        kind: "path",
        root: "omp",
        path: "private/**",
        policy: "local-only",
        version: null,
        local: path.join(m.omp, "private/**"),
      },
      {
        kind: "skill",
        root: "agents",
        path: "mine",
        policy: "shared",
        version: null,
        local: path.join(m.skills, "mine"),
        origin: "authored",
        source: null,
        install: null,
      },
      {
        kind: "skill",
        root: "agents",
        path: "vendor",
        policy: "local-only",
        version: null,
        local: path.join(m.skills, "vendor"),
        origin: "external",
        source: "org/vendor",
        install: "echo vendor",
      },
    ]);
  });

  it("changes nothing, never prompts, and writes only the JSON document to stdout", () => {
    const m = registered();
    const before = { home: snapshot(m.home), repo: snapshot(m.repo) };
    const output = run(m.home, m.repo, "inspect", "--format=json");
    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe("");
    expect(() => JSON.parse(output.stdout)).not.toThrow();
    expect({ home: snapshot(m.home), repo: snapshot(m.repo) }).toEqual(before);
  });

  it("selects exactly by root, skill name, or root-qualified path", () => {
    const m = registered();
    expect(
      inspected(run(m.home, m.repo, "inspect", "--target", "agents", "--format=json")).items.map(
        (item) => item.path,
      ),
    ).toEqual(["mine", "vendor"]);
    expect(
      inspected(run(m.home, m.repo, "inspect", "--target", "vendor", "--format=json")).items.map(
        (item) => item.path,
      ),
    ).toEqual(["vendor"]);
    expect(
      inspected(
        run(m.home, m.repo, "inspect", "--target", "omp:config.yml", "--format=json"),
      ).items.map((item) => item.path),
    ).toEqual(["config.yml"]);
  });

  it("fails with UNKNOWN_TARGET and a nonzero exit for a target matching nothing", () => {
    const m = registered();
    const failed = run(m.home, m.repo, "inspect", "--target", "ven", "--format=json");
    expect(failed.exitCode).not.toBe(0);
    const value = result(failed);
    expect(value.outcome).toBe("failed");
    expect(codes(value)).toEqual(["UNKNOWN_TARGET"]);
  });

  it("reports a root without a machine binding as local: null instead of failing", () => {
    const home = tempDir();
    const repo = tempDir();
    run(home, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
    run(home, repo, "track", "path", "config.yml", "--root", "omp");
    const output = run(home, repo, "inspect", "--format=json");
    expect(output.exitCode).toBe(0);
    expect(inspected(output).items.map((item) => item.local)).toEqual([null]);
  });

  it("prints a human tree that marks local-only items", () => {
    const m = registered();
    const output = run(m.home, m.repo, "inspect");
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain("ai-sync:inspect");
    expect(output.stdout).toContain("omp:private/**");
    expect(output.stdout).toContain("local-only");
    expect(output.stdout).toContain("omp:config.yml");
  });
});

describe("given shared and local-only items, when previewing and transferring, then only shared items move (AC-01, AC-02)", () => {
  it("previews exactly the eligible shared paths and changes nothing", () => {
    const m = registered();
    const before = { home: snapshot(m.home), repo: snapshot(m.repo) };
    const push = result(run(m.home, m.repo, "push", "--target", "omp", "--format=json"));
    expect(push.outcome).toBe("preview");
    expect(push.scope.resolvedPaths).toEqual(["omp:config.yml", "omp:notes/n.md"]);
    const status = result(run(m.home, m.repo, "status", "--format=json"));
    expect(status.scope.resolvedPaths).not.toContain("omp:private/token.txt");
    expect({ home: snapshot(m.home), repo: snapshot(m.repo) }).toEqual(before);
  });

  it("never copies local-only skill content in either direction and never overwrites it from the backup", () => {
    const m = registered();
    fs.mkdirSync(path.join(m.skills, "shared-s"), { recursive: true });
    fs.writeFileSync(path.join(m.skills, "shared-s", "SKILL.md"), "old");
    const backups: [string, string][] = [
      ["shared-s", "backup shared"],
      ["vendor", "backup vendor"],
    ];
    for (const [name, text] of backups) {
      fs.mkdirSync(path.join(m.repo, ".agents", "skills", name), { recursive: true });
      fs.writeFileSync(path.join(m.repo, ".agents", "skills", name, "SKILL.md"), text);
    }
    fs.mkdirSync(path.join(m.skills, "vendor"), { recursive: true });
    fs.writeFileSync(path.join(m.skills, "vendor", "SKILL.md"), "local vendor");
    run(
      m.home,
      m.repo,
      "track",
      "skill",
      "shared-s",
      "--root",
      "agents",
      "--origin",
      "authored",
      "--sync",
    );

    const push = result(run(m.home, m.repo, "push", "--target", "agents", "--format=json"));
    expect(push.scope.resolvedPaths).toEqual(["agents:mine/SKILL.md", "agents:shared-s/SKILL.md"]);
    expect(
      run(m.home, m.repo, "pull", "--apply", "--target", "agents", "--format=json").exitCode,
    ).toBe(0);
    expect(fs.readFileSync(path.join(m.skills, "shared-s", "SKILL.md"), "utf8")).toBe(
      "backup shared",
    );
    expect(fs.readFileSync(path.join(m.skills, "vendor", "SKILL.md"), "utf8")).toBe("local vendor");
    expect(
      fs.readFileSync(path.join(m.repo, ".agents", "skills", "vendor", "SKILL.md"), "utf8"),
    ).toBe("backup vendor");
  });

  it("keeps local-only files out of the backup and untouched locally across two machines with different bindings (SC-004, AC-03)", () => {
    const repo = tempDir();
    const homeA = tempDir();
    const homeB = tempDir();
    const ompA = path.join(homeA, "omp");
    const ompB = path.join(homeB, "work", "agent-config");
    fs.mkdirSync(path.join(ompA, "private"), { recursive: true });
    fs.mkdirSync(path.join(ompB, "private"), { recursive: true });
    fs.writeFileSync(path.join(ompA, "config.yml"), "A shared");
    fs.writeFileSync(path.join(ompA, "private", "token.txt"), "A secret");
    fs.writeFileSync(path.join(ompB, "private", "token.txt"), "B secret");
    fs.mkdirSync(path.join(repo, ".omp", "private"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".omp", "private", "token.txt"), "backup copy");

    run(homeA, repo, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
    run(homeA, repo, "track", "path", "**", "--root", "omp");
    run(homeA, repo, "track", "path", "private/**", "--root", "omp", "--no-sync");
    const shared = manifestText(repo);
    run(homeA, repo, "root", "bind", "omp", "--local-root", ompA);
    run(homeB, repo, "root", "bind", "omp", "--local-root", ompB);
    expect(manifestText(repo)).toBe(shared);

    const a = inspected(run(homeA, repo, "inspect", "--format=json"));
    const b = inspected(run(homeB, repo, "inspect", "--format=json"));
    expect(a.items.map((item) => item.local)).toEqual([
      path.join(ompA, "**"),
      path.join(ompA, "private/**"),
    ]);
    expect(b.items.map((item) => item.local)).toEqual([
      path.join(ompB, "**"),
      path.join(ompB, "private/**"),
    ]);
    expect(a.items.map((item) => item.policy)).toEqual(b.items.map((item) => item.policy));

    expect(run(homeA, repo, "push", "--apply", "--target", "omp").exitCode).toBe(0);
    expect(fs.readFileSync(path.join(repo, ".omp", "config.yml"), "utf8")).toBe("A shared");
    expect(fs.readFileSync(path.join(repo, ".omp", "private", "token.txt"), "utf8")).toBe(
      "backup copy",
    );

    expect(run(homeB, repo, "pull", "--apply", "--target", "omp").exitCode).toBe(0);
    expect(fs.readFileSync(path.join(ompB, "config.yml"), "utf8")).toBe("A shared");
    expect(fs.readFileSync(path.join(ompB, "private", "token.txt"), "utf8")).toBe("B secret");
    expect(fs.readFileSync(path.join(ompA, "private", "token.txt"), "utf8")).toBe("A secret");
    expect(manifestText(repo)).toBe(shared);
  });
});

describe("given external skills with installer commands, when bootstrap runs, then commands are reviewed and never run without approval (FR-016)", () => {
  interface External {
    home: string;
    repo: string;
    local: string;
    marker: string;
    command: string;
    /** `<root>:<skill>@<hash>` as the review output shows it */
    approval: string;
  }

  /** First 12 hex characters of the SHA-256 of the exact installer command string. */
  function hashOf(command: string): string {
    return createHash("sha256").update(command).digest("hex").slice(0, 12);
  }

  function external(install: string | null = null): External {
    const home = tempDir();
    const repo = tempDir();
    const local = path.join(home, "skills");
    const marker = path.join(home, "installed");
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(home, repo, "root", "bind", "agents", "--local-root", local);
    const command = install ?? `touch ${marker}`;
    run(
      home,
      repo,
      "track",
      "skill",
      "external-tool",
      "--root",
      "agents",
      "--origin",
      "external",
      "--install",
      command,
      "--no-sync",
    );
    return {
      home,
      repo,
      local,
      marker,
      command,
      approval: `agents:external-tool@${hashOf(command)}`,
    };
  }

  it("shows the installer command and does not run it by default", () => {
    const e = external();
    const output = run(e.home, e.repo, "bootstrap");
    expect(output.exitCode).toBe(0);
    expect(fs.existsSync(e.marker)).toBe(false);
    expect(output.stdout).toContain(`touch ${e.marker}`);
    expect(output.stdout).toContain(e.approval);
    expect(output.stdout).toContain("--approve-install");
  });

  it("reports the pending installer as a proposed action in the JSON envelope", () => {
    const e = external();
    const output = run(e.home, e.repo, "bootstrap", "--format=json");
    expect(output.exitCode).toBe(0);
    const value = inspected(output);
    expect(fs.existsSync(e.marker)).toBe(false);
    expect(value.operation).toBe("bootstrap");
    expect(value.outcome).toBe("preview");
    expect(value.scope).toEqual({ roots: ["agents"], resolvedPaths: ["agents:external-tool"] });
    expect(value.actions).toEqual([{ id: "a1", state: "proposed" }]);
    expect(value.errors).toEqual([]);
    expect(value.items).toEqual([
      {
        kind: "skill",
        root: "agents",
        path: "external-tool",
        policy: "local-only",
        version: null,
        local: path.join(e.local, "external-tool"),
        origin: "external",
        source: null,
        install: `touch ${e.marker}`,
        installHash: hashOf(e.command),
      },
    ]);
  });

  it("runs only the explicitly approved installer", () => {
    const e = external();
    const output = run(
      e.home,
      e.repo,
      "bootstrap",
      "--approve-install",
      e.approval,
      "--format=json",
    );
    expect(output.exitCode).toBe(0);
    const value = inspected(output);
    expect(fs.existsSync(e.marker)).toBe(true);
    expect(value.outcome).toBe("success");
    expect(value.actions).toEqual([{ id: "a1", state: "completed" }]);
  });

  it("rejects an approval naming no pending installer before running anything", () => {
    const e = external();
    const output = run(
      e.home,
      e.repo,
      "bootstrap",
      "--approve-install",
      e.approval,
      "--approve-install",
      `agents:other@${hashOf("x")}`,
      "--format=json",
    );
    expect(output.exitCode).not.toBe(0);
    const value = result(output);
    expect(value.outcome).toBe("failed");
    expect(value.errors).toEqual([
      expect.objectContaining({ code: "UNKNOWN_TARGET", item: "agents:other" }),
    ]);
    expect(fs.existsSync(e.marker)).toBe(false);
  });

  it("reports a failing approved installer as a failed action with the command in the recovery", () => {
    const e = external("exit 3");
    const output = run(
      e.home,
      e.repo,
      "bootstrap",
      "--approve-install",
      e.approval,
      "--format=json",
    );
    expect(output.exitCode).not.toBe(0);
    const value = result(output);
    expect(value.outcome).toBe("failed");
    expect(value.actions).toEqual([expect.objectContaining({ id: "a1", state: "failed" })]);
    expect(value.errors).toEqual([
      expect.objectContaining({ code: "IO_FAILED", item: "agents:external-tool" }),
    ]);
    expect(value.recovery).toContain("exit 3");
  });

  it("does not offer a skill that is already installed or no longer tracked", () => {
    const e = external();
    fs.mkdirSync(path.join(e.local, "external-tool"), { recursive: true });
    const installed = run(e.home, e.repo, "bootstrap", "--format=json");
    expect(inspected(installed).items).toEqual([]);
    expect(
      result(
        run(e.home, e.repo, "bootstrap", "--approve-install", e.approval, "--format=json"),
      ).errors.map((error) => error.code),
    ).toEqual(["UNKNOWN_TARGET"]);

    fs.rmSync(path.join(e.local, "external-tool"), { recursive: true });
    run(e.home, e.repo, "untrack", "skill", "external-tool", "--root", "agents");
    expect(inspected(run(e.home, e.repo, "bootstrap", "--format=json")).items).toEqual([]);
    expect(fs.existsSync(e.marker)).toBe(false);
  });

  it("derives the installer from the recorded source for review and still does not run it", () => {
    const home = tempDir();
    const repo = tempDir();
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(home, repo, "root", "bind", "agents", "--local-root", path.join(home, "skills"));
    run(
      home,
      repo,
      "track",
      "skill",
      "sourced",
      "--root",
      "agents",
      "--origin",
      "external",
      "--from",
      "org/sourced",
      "--no-sync",
    );
    run(
      home,
      repo,
      "track",
      "skill",
      "manual",
      "--root",
      "agents",
      "--origin",
      "external",
      "--no-sync",
    );
    const value = inspected(run(home, repo, "bootstrap", "--format=json"));
    expect(value.items.map((item) => [item.path, item.install])).toEqual([
      ["sourced", "npx -y skills add org/sourced -g"],
    ]);
    expect(value.recovery).toContain("agents:manual");
  });

  it("rejects an approval whose hash no longer matches the manifest command, before running anything", () => {
    const e = external();
    const reviewed = e.approval;
    const swapped = `touch ${e.marker} && echo changed-after-review`;
    run(
      e.home,
      e.repo,
      "track",
      "skill",
      "external-tool",
      "--root",
      "agents",
      "--origin",
      "external",
      "--install",
      swapped,
      "--no-sync",
    );
    const output = run(e.home, e.repo, "bootstrap", "--approve-install", reviewed, "--format=json");
    expect(output.exitCode).not.toBe(0);
    const value = result(output);
    expect(value.outcome).toBe("failed");
    expect(value.errors).toEqual([
      expect.objectContaining({ code: "PLAN_STALE_POLICY", item: "agents:external-tool" }),
    ]);
    expect(value.recovery).toContain(hashOf(swapped));
    expect(fs.existsSync(e.marker)).toBe(false);
    const rerun = result(
      run(
        e.home,
        e.repo,
        "bootstrap",
        "--approve-install",
        `agents:external-tool@${hashOf(swapped)}`,
        "--format=json",
      ),
    );
    expect(rerun.outcome).toBe("success");
    expect(fs.existsSync(e.marker)).toBe(true);
  });

  it("rejects an approval without a hash with PLAN_INVALID and runs nothing", () => {
    const e = external();
    const output = run(
      e.home,
      e.repo,
      "bootstrap",
      "--approve-install",
      "agents:external-tool",
      "--format=json",
    );
    expect(output.exitCode).not.toBe(0);
    expect(result(output).errors).toEqual([
      expect.objectContaining({ code: "PLAN_INVALID", item: "agents:external-tool" }),
    ]);
    expect(result(output).recovery).toContain(e.approval);
    expect(fs.existsSync(e.marker)).toBe(false);
  });

  it("hashes a source-derived installer command so it can be approved", () => {
    const home = tempDir();
    const repo = tempDir();
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(home, repo, "root", "bind", "agents", "--local-root", path.join(home, "skills"));
    run(
      home,
      repo,
      "track",
      "skill",
      "sourced",
      "--root",
      "agents",
      "--origin",
      "external",
      "--from",
      "org/sourced",
      "--no-sync",
    );
    const value = inspected(run(home, repo, "bootstrap", "--format=json"));
    expect(value.items.map((item) => item.installHash)).toEqual([
      hashOf("npx -y skills add org/sourced -g"),
    ]);
  });
});

describe("given items without a recorded version, when they are tracked, inspected, and synchronized, then the version stays unknown (FR-005, FR-016)", () => {
  function entries(repo: string): Record<string, unknown>[] {
    return JSON.parse(manifestText(repo)).entries as Record<string, unknown>[];
  }

  it("records no version key unless one is given, for files and skills alike", () => {
    const m = registered();
    const all = entries(m.repo);
    expect(all.find((entry) => entry.path === "notes/**")).toEqual({
      kind: "path",
      root: "omp",
      path: "notes/**",
      sync: true,
    });
    expect(all.find((entry) => entry.path === "config.yml")).toEqual({
      kind: "path",
      root: "omp",
      path: "config.yml",
      sync: true,
      version: "1.0",
    });
    expect(all.find((entry) => entry.path === "mine")).toEqual({
      kind: "skill",
      root: "agents",
      path: "mine",
      sync: true,
      skill: { origin: "authored" },
    });
    const versions = inspected(run(m.home, m.repo, "inspect", "--format=json")).items.map(
      (item) => item.version,
    );
    expect(versions).toEqual(["1.0", null, null, null, null]);
  });

  it("keeps a recorded file version when the policy is toggled or the path is tracked again", () => {
    const m = registered();
    run(m.home, m.repo, "untrack", "path", "config.yml", "--root", "omp");
    expect(entries(m.repo).find((entry) => entry.path === "config.yml")).toEqual({
      kind: "path",
      root: "omp",
      path: "config.yml",
      sync: false,
      version: "1.0",
    });
    run(m.home, m.repo, "track", "path", "config.yml", "--root", "omp");
    expect(entries(m.repo).find((entry) => entry.path === "config.yml")).toEqual({
      kind: "path",
      root: "omp",
      path: "config.yml",
      sync: true,
      version: "1.0",
    });
    run(m.home, m.repo, "track", "path", "config.yml", "--root", "omp", "--version", "1.1");
    expect(entries(m.repo).find((entry) => entry.path === "config.yml")).toEqual({
      kind: "path",
      root: "omp",
      path: "config.yml",
      sync: true,
      version: "1.1",
    });
  });

  it("does not increment or alter any version label when content changes and is synchronized", () => {
    const m = registered();
    const before = manifestText(m.repo);
    expect(run(m.home, m.repo, "push", "--apply", "--target", "omp").exitCode).toBe(0);
    fs.writeFileSync(path.join(m.omp, "config.yml"), "edited without a label change");
    const status = result(run(m.home, m.repo, "status", "--format=json"));
    expect(status.scope.resolvedPaths).toContain("omp:config.yml");
    expect(run(m.home, m.repo, "push", "--apply", "--target", "omp:config.yml").exitCode).toBe(0);
    expect(manifestText(m.repo)).toBe(before);
    expect(at(inspected(run(m.home, m.repo, "inspect", "--format=json")).items, 0).version).toBe(
      "1.0",
    );
  });
});

describe("given a symlink that leaves a managed root, when transferring, then the operation stops with PATH_ESCAPE and nothing is written (FR-010)", () => {
  it("rejects previews, plan files, and applies whose backup target runs through an escaping symlinked directory", () => {
    const f = fixture();
    const outside = tempDir();
    fs.mkdirSync(repoFile(f), { recursive: true });
    fs.symlinkSync(outside, repoFile(f, "sub"));
    const planFile = path.join(f.out, "escape.plan.json");

    const preview = run(f.home, f.repo, "push", "--target", "omp", "--format=json");
    expect(preview.exitCode).not.toBe(0);
    const value = result(preview);
    expect(value.outcome).toBe("failed");
    expect(value.errors).toEqual([
      expect.objectContaining({ code: "PATH_ESCAPE", item: "omp:sub/c.txt" }),
    ]);
    expect(value.recovery).toContain("symlink");

    expect(
      run(f.home, f.repo, "push", "--target", "omp", "--plan-out", planFile, "--format=json")
        .exitCode,
    ).not.toBe(0);
    expect(fs.existsSync(planFile)).toBe(false);

    const applied = run(f.home, f.repo, "push", "--apply", "--target", "omp", "--format=json");
    expect(applied.exitCode).not.toBe(0);
    expect(codes(result(applied))).toEqual(["PATH_ESCAPE"]);
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
  });

  it("rejects a pull whose machine-local target runs through an escaping symlinked directory", () => {
    const f = fixture();
    const outside = tempDir();
    fs.rmSync(path.join(f.local, "sub"), { recursive: true });
    fs.symlinkSync(outside, path.join(f.local, "sub"));
    fs.mkdirSync(repoFile(f, "sub"), { recursive: true });
    fs.writeFileSync(repoFile(f, "sub", "z.txt"), "from backup");
    fs.writeFileSync(repoFile(f, "d.txt"), "from backup");
    const applied = run(f.home, f.repo, "pull", "--apply", "--target", "omp", "--format=json");
    expect(applied.exitCode).not.toBe(0);
    expect(result(applied).errors).toEqual([
      expect.objectContaining({ code: "PATH_ESCAPE", item: "omp:sub/z.txt" }),
    ]);
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.existsSync(path.join(f.local, "d.txt"))).toBe(false);
  });

  it("rejects a saved plan whose target directory became an escaping symlink after the preview, with zero mutation", () => {
    const f = fixture();
    const outside = tempDir();
    const file = path.join(f.out, "push.plan.json");
    expect(run(f.home, f.repo, "push", "--plan-out", file, "--target", "omp").exitCode).toBe(0);
    fs.mkdirSync(repoFile(f), { recursive: true });
    fs.symlinkSync(outside, repoFile(f, "sub"));
    const applied = run(f.home, f.repo, "apply", file, "--apply", "--format=json");
    expect(applied.exitCode).not.toBe(0);
    const value = result(applied);
    expect(value.outcome).toBe("failed");
    expect(codes(value)).toEqual(["PATH_ESCAPE"]);
    expect(value.actions.every((action) => action.state === "not_attempted")).toBe(true);
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.existsSync(repoFile(f, "a.txt"))).toBe(false);
  });

  it("never reads a skill directory that is a symlink to a place outside its root", () => {
    const m = registered();
    const outside = tempDir();
    fs.writeFileSync(path.join(outside, "SKILL.md"), "outside secret");
    fs.rmSync(path.join(m.skills, "mine"), { recursive: true });
    fs.symlinkSync(outside, path.join(m.skills, "mine"));
    const applied = run(m.home, m.repo, "push", "--apply", "--target", "agents", "--format=json");
    expect(applied.exitCode).not.toBe(0);
    expect(result(applied).errors).toEqual([
      expect.objectContaining({ code: "PATH_ESCAPE", item: "agents:mine/SKILL.md" }),
    ]);
    expect(fs.existsSync(path.join(m.repo, ".agents", "skills", "mine"))).toBe(false);
  });

  it("still transfers through a symlink that stays inside the root", () => {
    const f = fixture();
    fs.mkdirSync(repoFile(f, "real"), { recursive: true });
    fs.symlinkSync(repoFile(f, "real"), repoFile(f, "sub"));
    expect(run(f.home, f.repo, "push", "--apply", "--target", "omp").exitCode).toBe(0);
    expect(fs.readFileSync(repoFile(f, "real", "c.txt"), "utf8")).toBe("c");
  });
});

/** Run Git in a disposable repository with no user, system, or global configuration. */
function git(home: string, repo: string, ...args: string[]): string {
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
  const out = Bun.spawnSync(
    [
      "git",
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: repo, env },
  );
  if (out.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${out.stderr.toString()}`);
  return out.stdout.toString();
}

interface Prunable extends Registered {
  out: string;
}

/**
 * `registered()` plus a local-only Orca extension rule. The backup holds shared copies that must
 * survive, excluded copies that may go (one committed then edited, one never committed), and a
 * file no rule mentions. Local copies of everything exist.
 */
function prunable(): Prunable {
  const m = registered();
  const out = tempDir();
  run(m.home, m.repo, "track", "path", "extensions/orca-*/**", "--root", "omp", "--no-sync");
  for (const name of ["orca-a", "orca-b"]) {
    fs.mkdirSync(path.join(m.omp, "extensions", name), { recursive: true });
    fs.writeFileSync(path.join(m.omp, "extensions", name, "index.ts"), `local ${name}`);
  }
  fs.mkdirSync(path.join(m.skills, "vendor"), { recursive: true });
  fs.writeFileSync(path.join(m.skills, "vendor", "SKILL.md"), "local vendor");
  const put = (file: string, content: string): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const backup = (...parts: string[]): string => path.join(m.repo, ...parts);
  put(backup(".omp", "config.yml"), "shared config");
  put(backup(".omp", "notes", "n.md"), "note");
  put(backup(".omp", "unmatched.bin"), "no rule mentions me");
  put(backup(".agents", "skills", "mine", "SKILL.md"), "mine");
  put(backup(".omp", "extensions", "orca-a", "index.ts"), "committed orca-a");
  put(backup(".omp", "private", "token.txt"), "backup secret");
  put(backup(".agents", "skills", "vendor", "SKILL.md"), "backup vendor");
  git(m.home, m.repo, "init", "-q");
  git(m.home, m.repo, "add", "-A");
  git(m.home, m.repo, "commit", "-q", "-m", "base");
  fs.writeFileSync(backup(".omp", "extensions", "orca-a", "index.ts"), "edited after the commit");
  put(backup(".omp", "extensions", "orca-b", "index.ts"), "never committed");
  put(backup(".omp", "private", "sub", "deep.txt"), "never committed");
  return { ...m, out };
}

const EXCLUDED_COPIES = [
  "agents:vendor/SKILL.md",
  "omp:extensions/orca-a/index.ts",
  "omp:extensions/orca-b/index.ts",
  "omp:private/sub/deep.txt",
  "omp:private/token.txt",
];

function worldState(m: Prunable): {
  backup: Record<string, string>;
  local: Record<string, string>;
  status: string;
  head: string;
} {
  return {
    backup: snapshot(m.repo),
    local: {
      ...snapshot(m.omp),
      ...Object.fromEntries(
        Object.entries(snapshot(m.skills)).map(([key, value]) => [`skills/${key}`, value]),
      ),
    },
    status: git(m.home, m.repo, "status", "--porcelain", "-uall"),
    head: git(m.home, m.repo, "rev-parse", "HEAD"),
  };
}

describe("given backup copies of items the policy now excludes, when previewing prune, then exact copies are listed and nothing changes (AC-05, FR-007)", () => {
  it("lists every excluded backup copy by exact path, committed or not, and leaves files and Git untouched", () => {
    const m = prunable();
    const before = worldState(m);
    const preview = run(m.home, m.repo, "prune", "--format=json");
    expect(preview.exitCode).toBe(0);
    const value = result(preview);
    expect(value.operation).toBe("prune");
    expect(value.outcome).toBe("preview");
    expect(value.scope).toEqual({ roots: ["agents", "omp"], resolvedPaths: EXCLUDED_COPIES });
    expect(value.actions).toEqual(
      EXCLUDED_COPIES.map((_, index) => ({ id: `a${index + 1}`, state: "proposed" })),
    );
    expect(value.errors).toEqual([]);
    expect(value.recovery).toContain("Git history");
    expect(worldState(m)).toEqual(before);
  });

  it("prints a human tree that names each backup copy and says local files stay", () => {
    const m = prunable();
    const preview = run(m.home, m.repo, "prune");
    expect(preview.exitCode).toBe(0);
    expect(preview.stdout).toContain("ai-sync:prune [preview]");
    for (const id of EXCLUDED_COPIES) expect(preview.stdout).toContain(id.replace(":", ":"));
    expect(preview.stdout).toContain("preview only");
    expect(preview.stdout).toContain("Git history");
  });

  it("narrows by exact target and reports unknown or empty selections", () => {
    const m = prunable();
    const scoped = result(
      run(m.home, m.repo, "prune", "--target", "omp:extensions", "--format=json"),
    );
    expect(scoped.scope.resolvedPaths).toEqual([
      "omp:extensions/orca-a/index.ts",
      "omp:extensions/orca-b/index.ts",
    ]);

    const unknown = run(m.home, m.repo, "prune", "--target", "nothing-like-this", "--format=json");
    expect(unknown.exitCode).not.toBe(0);
    expect(codes(result(unknown))).toEqual(["UNKNOWN_TARGET"]);

    const empty = run(m.home, m.repo, "prune", "--target", "mine", "--format=json");
    expect(empty.exitCode).not.toBe(0);
    expect(codes(result(empty))).toEqual(["EMPTY_SCOPE"]);
  });

  it("leaves out copies matched by --exclude, in previews and in the plan that apply rechecks", () => {
    const m = prunable();
    const preview = result(run(m.home, m.repo, "prune", "--exclude", "orca-b", "--format=json"));
    expect(preview.scope.resolvedPaths).toEqual(
      EXCLUDED_COPIES.filter((id) => !id.includes("orca-b")),
    );
    const file = path.join(m.out, "excluding.plan.json");
    expect(run(m.home, m.repo, "prune", "--exclude", "orca-b", "--plan-out", file).exitCode).toBe(
      0,
    );
    expect(run(m.home, m.repo, "apply", file, "--apply", "--format=json").exitCode).toBe(0);
    expect(fs.existsSync(path.join(m.repo, ".omp", "extensions", "orca-b", "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(m.repo, ".omp", "extensions", "orca-a", "index.ts"))).toBe(
      false,
    );
  });

  it("reports nothing to prune, without an error, when no backup copy is excluded", () => {
    const f = fixture();
    const preview = run(f.home, f.repo, "prune", "--format=json");
    expect(preview.exitCode).toBe(0);
    expect(result(preview)).toMatchObject({
      operation: "prune",
      outcome: "preview",
      actions: [],
      errors: [],
    });
  });

  it("keeps an unmatched backup file out of the listing: only an explicit exclusion marks a copy", () => {
    const m = prunable();
    const listed = result(run(m.home, m.repo, "prune", "--format=json")).scope.resolvedPaths;
    expect(listed).not.toContain("omp:unmatched.bin");
    expect(listed).not.toContain("omp:config.yml");
    expect(listed).not.toContain("agents:mine/SKILL.md");
  });
});

describe("given an approved prune, when it is applied directly, then only the bounded backup copies are removed (AC-06, FR-008, FR-009)", () => {
  it("refuses to apply without a bounded target and removes nothing", () => {
    const m = prunable();
    const before = worldState(m);
    for (const extra of [[], ["--target", "*"]]) {
      const refused = run(m.home, m.repo, "prune", "--apply", ...extra, "--format=json");
      expect(refused.exitCode).not.toBe(0);
      expect(codes(result(refused))).toEqual(["BROAD_SCOPE"]);
    }
    expect(worldState(m)).toEqual(before);
  });

  it("removes the targeted Orca copy, keeps local Orca files, other backup content, and Git history", () => {
    const m = prunable();
    const before = worldState(m);
    const applied = run(
      m.home,
      m.repo,
      "prune",
      "--apply",
      "--target",
      "omp:extensions/orca-a",
      "--format=json",
    );
    expect(applied.exitCode).toBe(0);
    const value = result(applied);
    expect(value.operation).toBe("prune");
    expect(value.outcome).toBe("success");
    expect(value.actions).toEqual([{ id: "a1", state: "completed" }]);
    expect(value.recovery).toContain("Git history");

    expect(fs.existsSync(path.join(m.repo, ".omp", "extensions", "orca-a", "index.ts"))).toBe(
      false,
    );
    const after = worldState(m);
    expect(after.local).toEqual(before.local);
    const expectedBackup = { ...before.backup };
    delete expectedBackup[path.join(".omp", "extensions", "orca-a", "index.ts")];
    const { ".git": _ignored, ...afterBackup } = Object.fromEntries(
      Object.entries(after.backup)
        .filter(([key]) => !key.startsWith(".git"))
        .map(([key, v]) => [key, v]),
    );
    const expectedWithoutGit = Object.fromEntries(
      Object.entries(expectedBackup).filter(([key]) => !key.startsWith(".git")),
    );
    expect(afterBackup).toEqual(expectedWithoutGit);
    expect(git(m.home, m.repo, "show", "HEAD:.omp/extensions/orca-a/index.ts")).toBe(
      "committed orca-a",
    );
    expect(after.head).toBe(before.head);
  });

  it("removes an uncommitted excluded copy and prints the human result", () => {
    const m = prunable();
    const applied = run(m.home, m.repo, "prune", "--apply", "--target", "omp:extensions/orca-b");
    expect(applied.exitCode).toBe(0);
    expect(applied.stdout).toContain("ai-sync:prune [apply]");
    expect(applied.stdout).toContain("omp:extensions/orca-b/index.ts");
    expect(fs.existsSync(path.join(m.repo, ".omp", "extensions", "orca-b", "index.ts"))).toBe(
      false,
    );
    expect(fs.readFileSync(path.join(m.omp, "extensions", "orca-b", "index.ts"), "utf8")).toBe(
      "local orca-b",
    );
  });

  it("cannot combine --plan-out with --apply", () => {
    const m = prunable();
    const combined = run(
      m.home,
      m.repo,
      "prune",
      "--apply",
      "--target",
      "omp:private",
      "--plan-out",
      path.join(m.out, "x.json"),
      "--format=json",
    );
    expect(combined.exitCode).not.toBe(0);
    expect(codes(result(combined))).toEqual(["PLAN_INVALID"]);
    expect(fs.existsSync(path.join(m.repo, ".omp", "private", "token.txt"))).toBe(true);
  });
});

describe("given a saved prune plan, when it is applied, then stale policy, files, and scope are rejected without deleting anything (FR-019)", () => {
  function savePrune(m: Prunable, ...extra: string[]): { file: string; plan: Plan } {
    const file = path.join(m.out, "prune.plan.json");
    const saved = run(m.home, m.repo, "prune", "--plan-out", file, ...extra);
    expect(saved.exitCode).toBe(0);
    return { file, plan: JSON.parse(fs.readFileSync(file, "utf8")) as Plan };
  }

  it("writes a delete action per excluded copy that records the backup digest and the untouched local counterpart", () => {
    const m = prunable();
    const saved = savePrune(m);
    expect(saved.plan.operation).toBe("prune");
    expect(saved.plan.scope.resolvedPaths).toEqual(EXCLUDED_COPIES);
    expect(saved.plan.actions.map((action) => action.type)).toEqual([
      "delete",
      "delete",
      "delete",
      "delete",
      "delete",
    ]);
    const token = saved.plan.actions.find((action) => action.path === "private/token.txt");
    expect(token?.target).toEqual({
      location: path.join(m.repo, ".omp", "private", "token.txt"),
      digest: {
        kind: "file",
        sha256: createHash("sha256").update("backup secret").digest("hex"),
        mode: expect.any(Number),
      },
    });
    expect(token?.source.location).toBe(path.join(m.omp, "private", "token.txt"));
    expect(fs.existsSync(path.join(m.repo, ".omp", "private", "token.txt"))).toBe(true);
  });

  it("verifies without --apply, then removes exactly the approved copies with --apply", () => {
    const m = prunable();
    const saved = savePrune(m);
    const before = worldState(m);
    const verified = run(m.home, m.repo, "apply", saved.file, "--format=json");
    expect(verified.exitCode).toBe(0);
    expect(result(verified).outcome).toBe("preview");
    expect(worldState(m)).toEqual(before);

    const applied = run(m.home, m.repo, "apply", saved.file, "--apply", "--format=json");
    expect(applied.exitCode).toBe(0);
    const value = result(applied);
    expect(value.operation).toBe("prune");
    expect(value.outcome).toBe("success");
    expect(value.actions.map((action) => action.state)).toEqual(Array(5).fill("completed"));
    expect(value.recovery).toContain("Git history");

    for (const kept of [
      [".omp", "config.yml"],
      [".omp", "notes", "n.md"],
      [".omp", "unmatched.bin"],
      [".agents", "skills", "mine", "SKILL.md"],
    ]) {
      expect(fs.existsSync(path.join(m.repo, ...kept))).toBe(true);
    }
    for (const gone of [
      [".omp", "private", "token.txt"],
      [".omp", "private", "sub", "deep.txt"],
      [".omp", "extensions", "orca-a", "index.ts"],
      [".omp", "extensions", "orca-b", "index.ts"],
      [".agents", "skills", "vendor", "SKILL.md"],
    ]) {
      expect(fs.existsSync(path.join(m.repo, ...gone))).toBe(false);
    }
    expect(worldState(m).local).toEqual(before.local);
    expect(git(m.home, m.repo, "show", "HEAD:.omp/private/token.txt")).toBe("backup secret");
  });

  it("rejects a plan whose policy changed, with zero mutation", () => {
    const m = prunable();
    const saved = savePrune(m);
    run(m.home, m.repo, "untrack", "path", "private/**", "--root", "omp");
    run(m.home, m.repo, "track", "path", "private/**", "--root", "omp");
    const before = worldState(m);
    const stale = run(m.home, m.repo, "apply", saved.file, "--apply", "--format=json");
    expect(stale.exitCode).not.toBe(0);
    const value = result(stale);
    expect(value.outcome).toBe("failed");
    expect(codes(value)).toEqual(["PLAN_STALE_POLICY"]);
    expect(value.actions.every((action) => action.state === "not_attempted")).toBe(true);
    expect(worldState(m)).toEqual(before);
  });

  it("rejects a plan whose backup copy changed or vanished, with zero mutation", () => {
    const m = prunable();
    const saved = savePrune(m);
    fs.writeFileSync(path.join(m.repo, ".omp", "private", "token.txt"), "edited after the preview");
    fs.rmSync(path.join(m.repo, ".omp", "extensions", "orca-b", "index.ts"));
    const before = worldState(m);
    const stale = run(m.home, m.repo, "apply", saved.file, "--apply", "--format=json");
    expect(stale.exitCode).not.toBe(0);
    const value = result(stale);
    expect(codes(value)).toEqual(["PLAN_STALE_TARGET", "PLAN_STALE_TARGET"]);
    expect(value.errors.map((error) => error.item)).toEqual([
      "omp:extensions/orca-b/index.ts",
      "omp:private/token.txt",
    ]);
    expect(worldState(m)).toEqual(before);
  });

  it("rejects a plan whose scope gained another excluded copy, with zero mutation", () => {
    const m = prunable();
    const saved = savePrune(m);
    fs.writeFileSync(
      path.join(m.repo, ".omp", "private", "later.txt"),
      "appeared after the preview",
    );
    const before = worldState(m);
    const stale = run(m.home, m.repo, "apply", saved.file, "--apply", "--format=json");
    expect(stale.exitCode).not.toBe(0);
    const value = result(stale);
    expect(codes(value)).toEqual(["PLAN_STALE_SCOPE"]);
    expect(at(value.errors, 0).item).toBe("omp:private/later.txt");
    expect(worldState(m)).toEqual(before);
  });

  it("rejects a forged plan that points a delete at a local file or outside the backup", () => {
    const m = prunable();
    const saved = savePrune(m, "--target", "omp:private/token.txt");
    const forged = JSON.parse(JSON.stringify(saved.plan)) as Plan;
    at(forged.actions, 0).target = {
      location: path.join(m.omp, "private", "token.txt"),
      digest: {
        kind: "file",
        sha256: createHash("sha256").update("local secret").digest("hex"),
        mode: 0o644,
      },
    };
    const forgedFile = path.join(m.out, "forged.plan.json");
    fs.writeFileSync(forgedFile, JSON.stringify(forged));
    const applied = run(m.home, m.repo, "apply", forgedFile, "--apply", "--format=json");
    expect(applied.exitCode).not.toBe(0);
    expect(codes(result(applied))).toEqual(["PLAN_INVALID"]);
    expect(fs.readFileSync(path.join(m.omp, "private", "token.txt"), "utf8")).toBe("local secret");

    const traversal = JSON.parse(JSON.stringify(saved.plan)) as Plan;
    at(traversal.actions, 0).path = "../../../outside.txt";
    traversal.scope.resolvedPaths = ["omp:../../../outside.txt"];
    const traversalFile = path.join(m.out, "traversal.plan.json");
    fs.writeFileSync(traversalFile, JSON.stringify(traversal));
    const escaped = run(m.home, m.repo, "apply", traversalFile, "--apply", "--format=json");
    expect(escaped.exitCode).not.toBe(0);
    expect(codes(result(escaped))).toEqual(["PATH_ESCAPE"]);
  });

  it("rejects a plan whose backup directory became an escaping symlink, and never deletes outside the backup", () => {
    const m = prunable();
    const saved = savePrune(m, "--target", "omp:private");
    const outside = tempDir();
    fs.mkdirSync(path.join(outside, "sub"));
    fs.writeFileSync(path.join(outside, "token.txt"), "outside backup");
    fs.writeFileSync(path.join(outside, "sub", "deep.txt"), "outside backup");
    fs.rmSync(path.join(m.repo, ".omp", "private"), { recursive: true });
    fs.symlinkSync(outside, path.join(m.repo, ".omp", "private"));
    const applied = run(m.home, m.repo, "apply", saved.file, "--apply", "--format=json");
    expect(applied.exitCode).not.toBe(0);
    expect(codes(result(applied)).every((code) => code === "PATH_ESCAPE")).toBe(true);
    expect(fs.readFileSync(path.join(outside, "token.txt"), "utf8")).toBe("outside backup");
    expect(fs.readFileSync(path.join(outside, "sub", "deep.txt"), "utf8")).toBe("outside backup");
  });

  it("reports a symlinked backup copy as unsupported and never removes or follows it", () => {
    const m = prunable();
    const outside = tempDir();
    fs.writeFileSync(path.join(outside, "target.txt"), "outside");
    fs.symlinkSync(
      path.join(outside, "target.txt"),
      path.join(m.repo, ".omp", "private", "link.txt"),
    );
    const preview = result(
      run(m.home, m.repo, "prune", "--target", "omp:private", "--format=json"),
    );
    expect(preview.scope.resolvedPaths).toContain("omp:private/link.txt");
    const applied = run(
      m.home,
      m.repo,
      "prune",
      "--apply",
      "--target",
      "omp:private/link.txt",
      "--format=json",
    );
    expect(applied.exitCode).not.toBe(0);
    const value = result(applied);
    expect(codes(value)).toEqual(["SYMLINK_UNSUPPORTED"]);
    expect(value.outcome).toBe("failed");
    expect(fs.lstatSync(path.join(m.repo, ".omp", "private", "link.txt")).isSymbolicLink()).toBe(
      true,
    );
    expect(fs.readFileSync(path.join(outside, "target.txt"), "utf8")).toBe("outside");
  });
});

describe("given content that changes independently of version labels, when drift is inspected, then SHA-256 decides (AC-08, AC-09, AC-10, SC-003)", () => {
  function drifting(m: Registered): string[] {
    return result(run(m.home, m.repo, "status", "--format=json")).scope.resolvedPaths;
  }

  function pushAll(m: Registered): void {
    for (const root of result(run(m.home, m.repo, "status", "--format=json")).scope.roots) {
      expect(run(m.home, m.repo, "push", "--apply", "--target", root).exitCode).toBe(0);
    }
  }

  function labels(m: Registered): (string | null)[] {
    return inspected(run(m.home, m.repo, "inspect", "--format=json")).items.map(
      (item) => item.version,
    );
  }

  it("reports drift for a labelled file and an unlabelled file when only content changes, and keeps both labels", () => {
    const m = registered();
    pushAll(m);
    expect(drifting(m)).toEqual([]);
    const manifest = manifestText(m.repo);
    fs.writeFileSync(path.join(m.omp, "config.yml"), "edited, label still 1.0");
    fs.writeFileSync(path.join(m.omp, "notes", "n.md"), "edited, never labelled");
    expect(drifting(m)).toEqual(["omp:config.yml", "omp:notes/n.md"]);
    pushAll(m);
    expect(drifting(m)).toEqual([]);
    expect(manifestText(m.repo)).toBe(manifest);
    expect(labels(m)[0]).toBe("1.0");
    expect(labels(m)[1]).toBeNull();
  });

  it("reports drift for a labelled skill and an unlabelled skill when only content changes, and keeps both labels", () => {
    const m = registered();
    fs.mkdirSync(path.join(m.skills, "other"), { recursive: true });
    fs.writeFileSync(path.join(m.skills, "other", "SKILL.md"), "other");
    run(
      m.home,
      m.repo,
      "track",
      "skill",
      "mine",
      "--root",
      "agents",
      "--origin",
      "authored",
      "--sync",
      "--version",
      "1.2",
    );
    run(
      m.home,
      m.repo,
      "track",
      "skill",
      "other",
      "--root",
      "agents",
      "--origin",
      "authored",
      "--sync",
    );
    pushAll(m);
    expect(drifting(m)).toEqual([]);
    const manifest = manifestText(m.repo);
    fs.writeFileSync(path.join(m.skills, "mine", "SKILL.md"), "edited, label still 1.2");
    fs.writeFileSync(path.join(m.skills, "other", "SKILL.md"), "edited, never labelled");
    expect(drifting(m)).toEqual(["agents:mine/SKILL.md", "agents:other/SKILL.md"]);
    pushAll(m);
    expect(manifestText(m.repo)).toBe(manifest);
    const skillLabels = inspected(
      run(m.home, m.repo, "inspect", "--target", "agents", "--format=json"),
    )
      .items.map((item) => `${item.path}=${item.version}`)
      .sort();
    expect(skillLabels).toEqual(["mine=1.2", "other=null", "vendor=null"]);
  });

  it("does not create content drift when only a label changes, for a file and a skill", () => {
    const m = registered();
    pushAll(m);
    expect(drifting(m)).toEqual([]);
    run(m.home, m.repo, "track", "path", "config.yml", "--root", "omp", "--version", "9.9");
    run(
      m.home,
      m.repo,
      "track",
      "skill",
      "mine",
      "--root",
      "agents",
      "--origin",
      "authored",
      "--sync",
      "--version",
      "3.0",
    );
    expect(drifting(m)).toEqual([]);
    expect(
      inspected(run(m.home, m.repo, "inspect", "--format=json")).items.map((item) => item.version),
    ).toContain("9.9");
    const pushed = run(m.home, m.repo, "push", "--target", "omp", "--format=json");
    expect(result(pushed).actions).toEqual([]);
  });

  it("keeps a saved skill plan valid when only the skill's version label changed", () => {
    const m = registered();
    const planFile = path.join(tempDir(), "skill.plan.json");
    expect(run(m.home, m.repo, "push", "--target", "agents", "--plan-out", planFile).exitCode).toBe(
      0,
    );
    run(
      m.home,
      m.repo,
      "track",
      "skill",
      "mine",
      "--root",
      "agents",
      "--origin",
      "authored",
      "--sync",
      "--version",
      "4.1",
    );
    const applied = run(m.home, m.repo, "apply", planFile, "--apply", "--format=json");
    expect(applied.exitCode).toBe(0);
    expect(result(applied).outcome).toBe("success");
    expect(fs.existsSync(path.join(m.repo, ".agents", "skills", "mine", "SKILL.md"))).toBe(true);
    expect(labels(m)).toContain("4.1");
  });

  it("keeps a saved plan valid when only a version label changed, but rejects it when content changed", () => {
    const m = registered();
    const planFile = path.join(tempDir(), "push.plan.json");
    expect(run(m.home, m.repo, "push", "--target", "omp", "--plan-out", planFile).exitCode).toBe(0);
    run(m.home, m.repo, "track", "path", "config.yml", "--root", "omp", "--version", "2.0");
    const applied = run(m.home, m.repo, "apply", planFile, "--apply", "--format=json");
    expect(applied.exitCode).toBe(0);
    expect(result(applied).outcome).toBe("success");
    expect(fs.existsSync(path.join(m.repo, ".omp", "config.yml"))).toBe(true);
    expect(labels(m)[0]).toBe("2.0");

    const second = path.join(tempDir(), "second.plan.json");
    fs.writeFileSync(path.join(m.omp, "config.yml"), "content changed after label change");
    expect(run(m.home, m.repo, "push", "--target", "omp", "--plan-out", second).exitCode).toBe(0);
    fs.writeFileSync(path.join(m.omp, "config.yml"), "content changed again");
    const stale = run(m.home, m.repo, "apply", second, "--apply", "--format=json");
    expect(stale.exitCode).not.toBe(0);
    expect(codes(result(stale))).toEqual(["PLAN_STALE_SOURCE"]);
  });
});

describe("given a tracked skill with recorded metadata, when it is re-tracked with fewer flags, then recorded metadata survives", () => {
  function manifestEntries(repo: string): {
    kind: string;
    root: string;
    path: string;
    sync: boolean;
    skill?: Record<string, unknown>;
  }[] {
    return JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"))
      .entries;
  }

  it("keeps version, source, source type, install, and description unless a flag replaces them", () => {
    const home = tempDir();
    const repo = tempDir();
    run(home, repo, "root", "add", "agents", "--kind", "skill", "--repo-root", ".agents/skills");
    run(
      home,
      repo,
      "track",
      "skill",
      "tool",
      "--root",
      "agents",
      "--origin",
      "external",
      "--from",
      "org/tool",
      "--version",
      "1.2",
      "--install",
      "echo install",
      "--description",
      "A tool",
      "--no-sync",
    );
    const recorded = manifestEntries(repo).find((entry) => entry.path === "tool")?.skill;
    expect(recorded).toMatchObject({
      origin: "external",
      source: "org/tool",
      version: "1.2",
      install: "echo install",
      description: "A tool",
    });

    expect(
      run(
        home,
        repo,
        "track",
        "skill",
        "tool",
        "--root",
        "agents",
        "--origin",
        "external",
        "--no-sync",
      ).exitCode,
    ).toBe(0);
    expect(manifestEntries(repo).find((entry) => entry.path === "tool")?.skill).toEqual(recorded);

    run(
      home,
      repo,
      "track",
      "skill",
      "tool",
      "--root",
      "agents",
      "--origin",
      "external",
      "--version",
      "2.0",
      "--no-sync",
    );
    expect(manifestEntries(repo).find((entry) => entry.path === "tool")?.skill).toEqual({
      ...recorded,
      version: "2.0",
    });
    expect(manifestEntries(repo).filter((entry) => entry.path === "tool")).toHaveLength(1);
  });
});

describe("given a skill deleted locally, when it is retired and pruned, then its backup copy and emptied folders go", () => {
  const manifestOf = (repo: string): { entries: Record<string, unknown>[] } =>
    JSON.parse(fs.readFileSync(path.join(repo, ".ai-sync", "manifest.json"), "utf8"));

  it("untrack --prune keeps the skill as an exclusion with its recorded origin, so prune can target it", () => {
    const m = registered();
    const backupFile = path.join(m.repo, ".agents", "skills", "mine", "SKILL.md");
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    fs.writeFileSync(backupFile, "mine");
    const retired = run(m.home, m.repo, "untrack", "skill", "mine", "--root", "agents", "--prune");
    expect(retired.exitCode).toBe(0);
    const entry = manifestOf(m.repo).entries.find((e) => e.path === "mine");
    expect(entry).toMatchObject({ sync: false, skill: { origin: "authored" } });
    const preview = result(
      run(m.home, m.repo, "prune", "--target", "agents:mine", "--format=json"),
    );
    expect(preview.scope.resolvedPaths).toEqual(["agents:mine/SKILL.md"]);
  });

  it("re-tracks an existing skill without --origin but still demands one for a new skill", () => {
    const m = registered();
    expect(
      run(m.home, m.repo, "track", "skill", "mine", "--root", "agents", "--no-sync").exitCode,
    ).toBe(0);
    expect(manifestOf(m.repo).entries.find((e) => e.path === "mine")).toMatchObject({
      sync: false,
      skill: { origin: "authored" },
    });
    expect(run(m.home, m.repo, "track", "skill", "fresh", "--root", "agents").exitCode).not.toBe(0);
  });

  it("applying a prune removes folders it emptied but keeps folders that still hold files and the root folder", () => {
    const m = prunable();
    const applied = run(
      m.home,
      m.repo,
      "prune",
      "--apply",
      "--target",
      "omp:extensions/orca-a/index.ts",
      "--format=json",
    );
    expect(applied.exitCode).toBe(0);
    expect(fs.existsSync(path.join(m.repo, ".omp", "extensions", "orca-a"))).toBe(false);
    expect(fs.existsSync(path.join(m.repo, ".omp", "extensions", "orca-b", "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(m.repo, ".omp", "config.yml"))).toBe(true);
  });
});

interface Retirable extends Registered {
  remote: string;
}

/** `registered()` with the skill `mine` also in a committed backup that pushes to a bare remote. */
function retirable(): Retirable {
  const m = registered();
  const remote = tempDir();
  fs.writeFileSync(
    path.join(m.home, ".gitconfig"),
    "[user]\n\tname = t\n\temail = t@example.invalid\n",
  );
  git(m.home, remote, "init", "-q", "--bare", "-b", "main");
  const backupFile = path.join(m.repo, ".agents", "skills", "mine", "SKILL.md");
  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  fs.writeFileSync(backupFile, "mine");
  git(m.home, m.repo, "init", "-q", "-b", "main");
  git(m.home, m.repo, "add", "-A");
  git(m.home, m.repo, "commit", "-q", "-m", "base");
  git(m.home, m.repo, "remote", "add", "origin", remote);
  git(m.home, m.repo, "push", "-q", "-u", "origin", "main");
  return { ...m, remote };
}

describe("given a skill with a committed backup copy, when it is retired", () => {
  const retire = (m: Retirable, ...extra: string[]): RunOutput =>
    run(m.home, m.repo, "retire", "mine", "--root", "agents", "--format=json", ...extra);
  const remoteHas = (m: Retirable): string =>
    git(m.home, m.remote, "ls-tree", "-r", "--name-only", "main");

  it("previews the removal and the Git export without changing files, policy, or Git", () => {
    const m = retirable();
    const before = { files: snapshot(m.repo), head: git(m.home, m.repo, "rev-parse", "HEAD") };
    const preview = retire(m, "--git-push");
    expect(preview.exitCode).toBe(0);
    const value = result(preview);
    expect(value.outcome).toBe("preview");
    expect(value.scope.resolvedPaths).toEqual(["agents:mine/SKILL.md"]);
    expect(value.git?.exportedPaths).toEqual([
      ".agents/skills/mine/SKILL.md",
      ".ai-sync/manifest.json",
    ]);
    expect(value.git?.unrelatedChanges).toEqual([]);
    expect({ files: snapshot(m.repo), head: git(m.home, m.repo, "rev-parse", "HEAD") }).toEqual(
      before,
    );
  });

  it("removes the copy and its folder, then commits and pushes exactly those paths", () => {
    const m = retirable();
    expect(remoteHas(m)).toContain(".agents/skills/mine/SKILL.md");
    const applied = retire(m, "--apply", "--git-push");
    expect(applied.exitCode).toBe(0);
    expect(result(applied).outcome).toBe("success");
    expect(fs.existsSync(path.join(m.repo, ".agents", "skills", "mine"))).toBe(false);
    expect(remoteHas(m)).not.toContain(".agents/skills/mine/SKILL.md");
    expect(git(m.home, m.repo, "log", "-1", "--format=%s").trim()).toBe("sync: retire mine");
    expect(git(m.home, m.repo, "status", "--porcelain")).toBe("");
  });

  it("retires several skills in one commit, so one skill's pending deletion never blocks another's", () => {
    const m = retirable();
    const other = path.join(m.repo, ".agents", "skills", "other", "SKILL.md");
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(other, "other");
    run(m.home, m.repo, "track", "skill", "other", "--root", "agents", "--origin", "authored");
    git(m.home, m.repo, "add", "-A");
    git(m.home, m.repo, "commit", "-q", "-m", "add other");
    git(m.home, m.repo, "push", "-q");
    const applied = run(
      m.home,
      m.repo,
      "retire",
      "mine",
      "other",
      "--root",
      "agents",
      "--apply",
      "--git-push",
      "--format=json",
    );
    expect(applied.exitCode).toBe(0);
    expect(remoteHas(m)).not.toContain("SKILL.md");
    expect(git(m.home, m.repo, "log", "-1", "--format=%s").trim()).toBe("sync: retire mine, other");
  });

  it("blocks the push on an unrelated change and leaves the backup untouched", () => {
    const m = retirable();
    fs.writeFileSync(path.join(m.repo, "stray.txt"), "not mine");
    const before = snapshot(m.repo);
    const blocked = retire(m, "--apply", "--git-push");
    expect(blocked.exitCode).not.toBe(0);
    expect(codes(result(blocked))).toEqual(["GIT_DIRTY_UNRELATED"]);
    expect(snapshot(m.repo)).toEqual(before);
    expect(remoteHas(m)).toContain(".agents/skills/mine/SKILL.md");
  });

  it("retires without Git when --git-push is absent, and a later run pushes the pending deletion", () => {
    const m = retirable();
    const applied = retire(m, "--apply");
    expect(applied.exitCode).toBe(0);
    expect(fs.existsSync(path.join(m.repo, ".agents", "skills", "mine"))).toBe(false);
    expect(remoteHas(m)).toContain(".agents/skills/mine/SKILL.md");
    const again = retire(m, "--apply", "--git-push");
    expect(again.exitCode).toBe(0);
    expect(remoteHas(m)).not.toContain(".agents/skills/mine/SKILL.md");
  });

  it("refuses a glob as the skill name and a skill that is not in the manifest", () => {
    const m = retirable();
    const glob = run(m.home, m.repo, "retire", "*", "--root", "agents", "--format=json");
    expect(codes(result(glob))).toEqual(["BROAD_SCOPE"]);
    const unknown = run(m.home, m.repo, "retire", "ghost", "--root", "agents", "--format=json");
    expect(codes(result(unknown))).toEqual(["UNKNOWN_TARGET"]);
  });
});

describe("given an excluded backup file in a path root, when it is retired with --target", () => {
  const remoteFiles = (m: Retirable): string =>
    git(m.home, m.remote, "ls-tree", "-r", "--name-only", "main");

  /** `retirable()` plus a committed, pushed backup file `.omp/extra/x.md` that the policy now excludes. */
  function excludedFile(): Retirable {
    const m = retirable();
    const file = path.join(m.repo, ".omp", "extra", "x.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "x");
    git(m.home, m.repo, "add", "-A");
    git(m.home, m.repo, "commit", "-q", "-m", "add x");
    git(m.home, m.repo, "push", "-q");
    expect(run(m.home, m.repo, "untrack", "path", "extra/x.md", "--root", "omp").exitCode).toBe(0);
    return m;
  }

  it("retires the file and a skill in one commit that removes both from the remote", () => {
    const m = excludedFile();
    const args = ["retire", "mine", "--root", "agents", "--target", "omp:extra/x.md"];
    const preview = run(m.home, m.repo, ...args, "--git-push", "--format=json");
    expect(preview.exitCode).toBe(0);
    expect(result(preview).scope.resolvedPaths).toEqual(["agents:mine/SKILL.md", "omp:extra/x.md"]);
    expect(fs.existsSync(path.join(m.repo, ".omp", "extra", "x.md"))).toBe(true);

    const applied = run(m.home, m.repo, ...args, "--apply", "--git-push", "--format=json");
    expect(applied.exitCode).toBe(0);
    expect(remoteFiles(m)).not.toContain("x.md");
    expect(remoteFiles(m)).not.toContain("mine/SKILL.md");
    expect(git(m.home, m.repo, "log", "-1", "--format=%s").trim()).toBe(
      "sync: retire mine, omp:extra/x.md",
    );
    expect(git(m.home, m.repo, "status", "--porcelain")).toBe("");
  });

  it("pushes an already pruned file's pending deletion without naming a skill", () => {
    const m = excludedFile();
    const pruned = run(m.home, m.repo, "prune", "--apply", "--target", "omp:extra/x.md");
    expect(pruned.exitCode).toBe(0);
    const applied = run(
      m.home,
      m.repo,
      "retire",
      "--target",
      "omp:extra/x.md",
      "--apply",
      "--git-push",
      "--format=json",
    );
    expect(applied.exitCode).toBe(0);
    expect(remoteFiles(m)).not.toContain("x.md");
    expect(remoteFiles(m)).toContain("mine/SKILL.md");
  });

  it("refuses a file the policy still manages, a glob, and a path that leaves the root", () => {
    const m = excludedFile();
    fs.mkdirSync(path.join(m.repo, ".omp", "notes"), { recursive: true });
    fs.writeFileSync(path.join(m.repo, ".omp", "notes", "n.md"), "managed");
    const retire = (target: string): RunOutput =>
      run(m.home, m.repo, "retire", "--target", target, "--format=json");
    expect(codes(result(retire("omp:notes/n.md")))).toEqual(["UNKNOWN_TARGET"]);
    expect(codes(result(retire("omp:extra/*.md")))).toEqual(["BROAD_SCOPE"]);
    expect(codes(result(retire("omp:../escape.md")))).toEqual(["BROAD_SCOPE"]);
  });
});

/**
 * `retirable()` after a restructure: the committed, pushed backup still holds the old layout of
 * `mine` and a deleted note beside what the machine has now. `.omp/private/old.txt` is a backup
 * copy the policy excludes, so it is never stale.
 */
function restructured(): Retirable {
  const m = retirable();
  fs.mkdirSync(path.join(m.skills, "mine", "new"), { recursive: true });
  fs.writeFileSync(path.join(m.skills, "mine", "new", "guide.md"), "guide");
  const backup: [string, string][] = [
    [".agents/skills/mine/old/deep/legacy.md", "legacy"],
    [".agents/skills/mine/old/legacy2.md", "legacy2"],
    [".omp/notes/gone.md", "gone"],
    [".omp/private/old.txt", "excluded copy"],
  ];
  for (const [relative, text] of backup) {
    const file = path.join(m.repo, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  git(m.home, m.repo, "add", "-A");
  git(m.home, m.repo, "commit", "-q", "-m", "old layout");
  git(m.home, m.repo, "push", "-q");
  return m;
}

describe("given a backup that holds the old layout, when pushing with --remove-stale", () => {
  const OLD_SKILL_FILES = [
    ".agents/skills/mine/old/deep/legacy.md",
    ".agents/skills/mine/old/legacy2.md",
  ];
  const push = (m: Retirable, ...extra: string[]): RunOutput =>
    run(m.home, m.repo, "push", "--target", "agents", "--remove-stale", "--format=json", ...extra);
  const remoteFiles = (m: Retirable): string[] => {
    const listing = git(m.home, m.remote, "ls-tree", "-r", "--name-only", "main");
    return listing.split("\n").filter(Boolean);
  };
  const commitCount = (m: Retirable): number => {
    const count = git(m.home, m.repo, "rev-list", "--count", "HEAD");
    return Number(count.trim());
  };

  it("lists each stale removal beside the copies in the preview and changes nothing", () => {
    const m = restructured();
    const before = snapshot(m.repo);
    const head = git(m.home, m.repo, "rev-parse", "HEAD");
    const preview = push(m, "--git-push");
    expect(preview.exitCode).toBe(0);
    const value = result(preview);
    expect(value.outcome).toBe("preview");
    expect([...value.scope.resolvedPaths].sort()).toEqual([
      "agents:mine/new/guide.md",
      "agents:mine/old/deep/legacy.md",
      "agents:mine/old/legacy2.md",
    ]);
    const typed = value.scope.resolvedPaths.map((id, index) => [id, value.actions[index]?.type]);
    expect(typed.filter(([, type]) => type === "delete").map(([id]) => id)).toEqual(
      expect.arrayContaining(["agents:mine/old/deep/legacy.md", "agents:mine/old/legacy2.md"]),
    );
    expect(typed.filter(([, type]) => type === "delete")).toHaveLength(2);
    expect(value.git?.exportedPaths).toEqual(
      [...OLD_SKILL_FILES, ".agents/skills/mine/new/guide.md"].sort(),
    );
    expect(value.git?.unrelatedChanges).toEqual([]);
    expect(snapshot(m.repo)).toEqual(before);
    expect(git(m.home, m.repo, "rev-parse", "HEAD")).toBe(head);

    const tree = run(m.home, m.repo, "push", "--target", "agents", "--remove-stale");
    expect(tree.exitCode).toBe(0);
    expect(tree.stdout).toContain("to_remove  2 stale backup file(s)");
    expect(tree.stdout).toContain("agents:mine/old/legacy2.md (remove:");
  });

  it("removes stale files with the copies in one commit and the remote loses them", () => {
    const m = restructured();
    const commitsBefore = commitCount(m);
    const applied = push(m, "--apply", "--git-push");
    expect(applied.exitCode).toBe(0);
    const value = result(applied);
    expect(value.outcome).toBe("success");
    expect(value.actions.filter((action) => action.type === "delete")).toHaveLength(2);
    expect(commitCount(m)).toBe(commitsBefore + 1);
    const changes = git(m.home, m.repo, "show", "--name-status", "--format=", "HEAD");
    expect(changes).toContain("A\t.agents/skills/mine/new/guide.md");
    for (const removed of OLD_SKILL_FILES) expect(changes).toContain(`D\t${removed}`);
    const remote = remoteFiles(m);
    expect(remote).toContain(".agents/skills/mine/new/guide.md");
    expect(remote).toContain(".agents/skills/mine/SKILL.md");
    for (const removed of OLD_SKILL_FILES) expect(remote).not.toContain(removed);
    expect(git(m.home, m.repo, "status", "--porcelain")).toBe("");
  });

  it("removes only inside the selected --target scope", () => {
    const m = restructured();
    const applied = push(m, "--apply", "--git-push");
    expect(applied.exitCode).toBe(0);
    expect(fs.existsSync(path.join(m.repo, ".omp", "notes", "gone.md"))).toBe(true);
    expect(remoteFiles(m)).toContain(".omp/notes/gone.md");
    const narrow = run(
      m.home,
      m.repo,
      "push",
      "--target",
      "omp:notes/gone.md",
      "--remove-stale",
      "--format=json",
    );
    expect(result(narrow).scope.resolvedPaths).toEqual(["omp:notes/gone.md"]);
  });

  it("leaves stale files in place without the flag", () => {
    const m = restructured();
    const applied = run(
      m.home,
      m.repo,
      "push",
      "--target",
      "agents",
      "--apply",
      "--git-push",
      "--format=json",
    );
    expect(applied.exitCode).toBe(0);
    expect(result(applied).scope.resolvedPaths).toEqual(["agents:mine/new/guide.md"]);
    for (const kept of OLD_SKILL_FILES) {
      expect(fs.existsSync(path.join(m.repo, kept))).toBe(true);
      expect(remoteFiles(m)).toContain(kept);
    }
  });

  it("never treats a policy-excluded backup copy as stale", () => {
    const m = restructured();
    const preview = run(
      m.home,
      m.repo,
      "push",
      "--target",
      "omp",
      "--remove-stale",
      "--format=json",
    );
    expect(preview.exitCode).toBe(0);
    const paths = result(preview).scope.resolvedPaths;
    expect(paths).toContain("omp:notes/gone.md");
    expect(paths.filter((id) => id.startsWith("omp:private/"))).toEqual([]);
    const applied = run(
      m.home,
      m.repo,
      "push",
      "--target",
      "omp",
      "--remove-stale",
      "--apply",
      "--format=json",
    );
    expect(applied.exitCode).toBe(0);
    expect(fs.existsSync(path.join(m.repo, ".omp", "private", "old.txt"))).toBe(true);
    expect(fs.existsSync(path.join(m.repo, ".omp", "notes", "gone.md"))).toBe(false);
  });

  it("blocks on an unrelated Git change and leaves the backup untouched", () => {
    const m = restructured();
    fs.writeFileSync(path.join(m.repo, "stray.txt"), "not mine");
    const before = snapshot(m.repo);
    const blocked = push(m, "--apply", "--git-push");
    expect(blocked.exitCode).not.toBe(0);
    expect(codes(result(blocked))).toEqual(["GIT_DIRTY_UNRELATED"]);
    expect(snapshot(m.repo)).toEqual(before);
    for (const kept of OLD_SKILL_FILES) expect(remoteFiles(m)).toContain(kept);
  });

  it("removes folders the removals empty but keeps folders that still hold files", () => {
    const m = restructured();
    expect(push(m, "--apply").exitCode).toBe(0);
    expect(fs.existsSync(path.join(m.repo, ".agents", "skills", "mine", "old"))).toBe(false);
    expect(fs.existsSync(path.join(m.repo, ".agents", "skills", "mine", "SKILL.md"))).toBe(true);
  });

  it("keeps the root's own backup folder when every file in it is stale", () => {
    const f = fixture();
    for (const name of ["a.txt", "b.txt"]) fs.rmSync(path.join(f.local, name));
    fs.rmSync(path.join(f.local, "sub"), { recursive: true });
    fs.mkdirSync(path.join(f.repo, ".omp", "x", "y"), { recursive: true });
    fs.writeFileSync(path.join(f.repo, ".omp", "x", "y", "only.txt"), "only");
    const applied = run(
      f.home,
      f.repo,
      "push",
      "--target",
      "omp",
      "--remove-stale",
      "--apply",
      "--format=json",
    );
    expect(applied.exitCode).toBe(0);
    expect(fs.existsSync(path.join(f.repo, ".omp", "x"))).toBe(false);
    expect(fs.existsSync(path.join(f.repo, ".omp"))).toBe(true);
  });

  it("refuses --remove-stale on a pull", () => {
    const m = restructured();
    const refused = run(m.home, m.repo, "pull", "--remove-stale", "--format=json");
    expect(refused.exitCode).not.toBe(0);
    expect(codes(result(refused))).toEqual(["PLAN_INVALID"]);
  });

  describe("with a saved plan", () => {
    const save = (m: Retirable): string => {
      const file = path.join(tempDir(), "stale.plan.json");
      const saved = run(
        m.home,
        m.repo,
        "push",
        "--target",
        "agents",
        "--remove-stale",
        "--plan-out",
        file,
      );
      expect(saved.exitCode).toBe(0);
      return file;
    };
    const applyPlan = (m: Retirable, file: string): RunOutput =>
      run(m.home, m.repo, "apply", file, "--apply", "--format=json");

    it("records the removals and applies them while nothing changed", () => {
      const m = restructured();
      const file = save(m);
      const recorded = JSON.parse(fs.readFileSync(file, "utf8")) as Plan;
      expect(recorded.scope.removeStale).toBe(true);
      const deletes = recorded.actions.filter((action) => action.type === "delete");
      expect(deletes).toHaveLength(2);
      for (const action of deletes) expect(action.source.digest).toEqual({ kind: "absent" });
      const applied = applyPlan(m, file);
      expect(applied.exitCode).toBe(0);
      for (const removed of OLD_SKILL_FILES) {
        expect(fs.existsSync(path.join(m.repo, removed))).toBe(false);
      }
      expect(fs.existsSync(path.join(m.repo, ".agents", "skills", "mine", "new", "guide.md"))).toBe(
        true,
      );
    });

    it("rejects the plan with PLAN_STALE_SOURCE when a local file reappears", () => {
      const m = restructured();
      const file = save(m);
      fs.mkdirSync(path.join(m.skills, "mine", "old"), { recursive: true });
      fs.writeFileSync(path.join(m.skills, "mine", "old", "legacy2.md"), "back again");
      const before = snapshot(m.repo);
      const rejected = applyPlan(m, file);
      expect(rejected.exitCode).not.toBe(0);
      expect(codes(result(rejected))).toEqual(["PLAN_STALE_SOURCE"]);
      expect(snapshot(m.repo)).toEqual(before);
    });

    it("rejects the plan with PLAN_STALE_TARGET when a backup file changed", () => {
      const m = restructured();
      const file = save(m);
      fs.writeFileSync(path.join(m.repo, OLD_SKILL_FILES[1] as string), "edited after preview");
      const before = snapshot(m.repo);
      const rejected = applyPlan(m, file);
      expect(rejected.exitCode).not.toBe(0);
      expect(codes(result(rejected))).toEqual(["PLAN_STALE_TARGET"]);
      expect(snapshot(m.repo)).toEqual(before);
    });

    it("rejects the plan with PLAN_STALE_SCOPE when another stale file appears", () => {
      const m = restructured();
      const file = save(m);
      fs.writeFileSync(path.join(m.repo, ".agents", "skills", "mine", "old", "extra.md"), "extra");
      const before = snapshot(m.repo);
      const rejected = applyPlan(m, file);
      expect(rejected.exitCode).not.toBe(0);
      expect(codes(result(rejected))).toEqual(["PLAN_STALE_SCOPE"]);
      expect(snapshot(m.repo)).toEqual(before);
    });
  });

  it("gives a second machine that pulls exactly the new layout", () => {
    const m = restructured();
    expect(push(m, "--apply", "--git-push").exitCode).toBe(0);
    const home2 = tempDir();
    const parent = tempDir();
    const skills2 = path.join(home2, "skills");
    fs.mkdirSync(skills2, { recursive: true });
    git(home2, parent, "clone", "-q", m.remote, "clone");
    const repo2 = path.join(parent, "clone");
    const bindAgents = run(home2, repo2, "root", "bind", "agents", "--local-root", skills2);
    const bindOmp = run(
      home2,
      repo2,
      "root",
      "bind",
      "omp",
      "--local-root",
      path.join(home2, "omp"),
    );
    expect(bindAgents.exitCode).toBe(0);
    expect(bindOmp.exitCode).toBe(0);
    const pulled = run(home2, repo2, "pull", "--target", "agents", "--apply", "--format=json");
    expect(pulled.exitCode).toBe(0);
    expect(snapshot(skills2)).toEqual({
      [path.join("mine", "SKILL.md")]: "mine",
      [path.join("mine", "new", "guide.md")]: "guide",
    });
  });
});
