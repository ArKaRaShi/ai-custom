import { describe, expect, it } from "bun:test";
import { canonicalOperation } from "@/scripts/render/exit-policy";
import { fallbackUsage, usageText } from "@/scripts/render/help";
import { parseArgs } from "@/scripts/render/parse-args";

const REPO = "/default/repo";
const ctx = { home: "/home/u", pathExists: (p: string): boolean => p === "existing" };
const parse = (args: string[]) => parseArgs(args, REPO, ctx);

describe("given raw CLI args, when parseArgs runs, then options and positionals map to ParsedArgs", () => {
  it("defaults", () => {
    const r = parse([]);
    expect(r.command).toBe("status");
    expect(r.repo).toBe(REPO);
    expect(r.opts).toEqual({ exclude: [], targets: [] });
    expect(r.args).toEqual([]);
    expect(r.meta).toEqual({});
  });

  it("parses space and equals value forms", () => {
    expect(parse(["push", "--format", "json"]).opts.format).toBe("json");
    expect(parse(["push", "--format=json"]).opts.format).toBe("json");
    expect(parse(["push", "--plan-out", "p.json"]).opts.planOut).toBe("p.json");
    expect(parse(["push", "--plan-out=p.json"]).opts.planOut).toBe("p.json");
    expect(parse(["push", "--message=hi"]).opts.commitMessage).toBe("hi");
    expect(parse(["push", "-m", "hi"]).opts.commitMessage).toBe("hi");
    expect(parse(["push", "--message", "hi"]).opts.commitMessage).toBe("hi");
  });

  it("collects repeatable flags", () => {
    const r = parse(["push", "--target", "a", "-t", "b", "--target=c", "-x", "e1", "--exclude=e2"]);
    expect(r.opts.targets).toEqual(["a", "b", "c"]);
    expect(r.opts.exclude).toEqual(["e1", "e2"]);
    const a = parse(["bootstrap", "--approve-install", "r:s@1", "--approve-install=r:t@2"]);
    expect(a.opts.approveInstall).toEqual(["r:s@1", "r:t@2"]);
  });

  it("parses booleans and tri-state toggles", () => {
    const r = parse(["push", "--apply", "--include-local", "--write", "--git-push"]);
    expect(r.opts).toMatchObject({ apply: true, includeLocal: true, write: true, gitPush: true });
    expect(parse(["pull", "--git-pull"]).opts.gitPull).toBe(true);
    expect(parse(["pull", "--no-git-pull"]).opts.gitPull).toBe(false);
    expect(parse(["push", "--no-git-push"]).opts.gitPush).toBe(false);
    expect(parse(["pull"]).opts.gitPull).toBeUndefined();
    expect(parse(["track", "--sync"]).meta.sync).toBe(true);
    expect(parse(["track", "--no-sync"]).meta.sync).toBe(false);
  });

  it("sets help for -h and --help", () => {
    expect(parse(["-h"]).meta.help).toBe(true);
    expect(parse(["--help"]).meta.help).toBe(true);
  });

  it("parses meta options", () => {
    const r = parse([
      "track",
      "skill",
      "x",
      "--root",
      "r",
      "--kind",
      "skill",
      "--repo-root",
      "rr",
      "--local-root",
      "~/l",
      "--origin",
      "external",
      "--source-type",
      "git",
      "--install",
      "cmd",
      "--description",
      "d",
      "--path",
      "e",
      "--from",
      "src",
      "--version=1.2",
    ]);
    expect(r.command).toBe("track");
    expect(r.args).toEqual(["skill", "x"]);
    expect(r.meta).toEqual({
      root: "r",
      kind: "skill",
      repoRoot: "rr",
      localRoot: "~/l",
      origin: "external",
      sourceType: "git",
      install: "cmd",
      description: "d",
      entryPath: "e",
      from: "src",
      version: "1.2",
    });
    expect(parse(["track", "--from=s", "--version", "3"]).meta).toEqual({
      from: "s",
      version: "3",
    });
  });

  it("ignores a trailing value flag and unknown flags", () => {
    const r = parse(["push", "--target"]);
    expect(r.opts.targets).toEqual([]);
    expect(parse(["push", "--bogus"]).command).toBe("push");
  });

  it("treats absolute, ~, or existing positional as repo", () => {
    expect(parse(["push", "/x/y"]).repo).toBe("/x/y");
    expect(parse(["push", "~/y"]).repo).toBe("/home/u/y");
    expect(parse(["push", "existing"]).repo).toBe("existing");
  });

  it("treats other positional as target only when none given", () => {
    expect(parse(["push", "skillname"]).opts.targets).toEqual(["skillname"]);
    expect(parse(["push", "skillname", "-t", "a"]).opts.targets).toEqual(["a"]);
    expect(parse(["push", "skillname"]).repo).toBe(REPO);
  });

  it("keeps sub-args for commands without a repo positional", () => {
    for (const c of ["track", "untrack", "root", "bootstrap", "discover", "apply"]) {
      const r = parse([c, "/abs"]);
      expect(r.repo).toBe(REPO);
      expect(r.args).toEqual(["/abs"]);
      expect(r.opts.targets).toEqual([]);
    }
  });

  it("init takes any positional as repo", () => {
    expect(parse(["init", "~/r"]).repo).toBe("/home/u/r");
    expect(parse(["init", "rel"]).repo).toBe("rel");
  });

  it("works without a context", () => {
    expect(parseArgs(["push", "rel"], REPO).opts.targets).toEqual(["rel"]);
  });
});

describe("given command aliases and help text, when looked up, then canonical names and usage are stable", () => {
  it("maps aliases", () => {
    expect(canonicalOperation("scan")).toBe("status");
    expect(canonicalOperation("save")).toBe("push");
    expect(canonicalOperation("restore")).toBe("bootstrap");
    expect(canonicalOperation("pull")).toBe("pull");
    expect(canonicalOperation("constructor")).toBe("constructor");
  });

  it("usage strings start as before", () => {
    expect(usageText.startsWith("Usage: bun sync.ts <command> [repo_path] [options]\n")).toBe(true);
    expect(usageText.endsWith("-h, --help             Show this help message")).toBe(true);
    expect(fallbackUsage.startsWith("Usage: bun sync.ts [status|inspect|")).toBe(true);
  });
});
