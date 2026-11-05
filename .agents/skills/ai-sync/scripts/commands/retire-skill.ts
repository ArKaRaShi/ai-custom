import * as path from "node:path";
import { untrackEntry } from "@/scripts/commands/untrack-entry";
import type { Io } from "@/scripts/io/io";
import type { SyncEntry, UnifiedManifest } from "@/scripts/lib/manifest";
import { manifestDiffOf } from "@/scripts/lib/manifest-diff";
import { loadUnifiedManifest } from "@/scripts/lib/manifest-repository";
import { type GitReport, type Result, type ResultError, syncError } from "@/scripts/lib/plan";
import { buildPrunePlan } from "@/scripts/lib/plan-builder";
import { executePlan } from "@/scripts/lib/plan-executor";
import { isExcludedByPolicy } from "@/scripts/lib/target-matcher";
import type { SyncOptions } from "@/scripts/lib/targets";

export interface RetireSkillInput {
  repoBase: string;
  /** Skill root of `names`; required when `names` is not empty. */
  rootId: string | null;
  /** Exact skill directory names. */
  names: string[];
  /** Exact `<root>:<path>` backup files the policy already excludes, or whose removal is pending. */
  files?: string[];
  opts: SyncOptions;
}

/** What a retire produced; `result` is the JSON envelope, the rest drives the tree renderer. */
export interface RetireSkillOutput {
  phase: "preview" | "apply";
  result: Result;
  /** Git push outcome line, present when `--git-push` ran. */
  extraLines: string[];
}

const MANIFEST_FILE = path.join(".ai-sync", "manifest.json");
/** One skill directory name: no separators, globs, or dot segments. */
const SKILL_NAME = /^(?!\.\.?$)[^/\\*?[\]{}]+$/;

/**
 * Retires skills and excluded files from the backup: excludes each skill from the policy, prunes
 * their backup copies and emptied folders, and with `--git-push` commits and pushes exactly those
 * paths plus the manifest.
 */
export function retireSkill(io: Io, input: RetireSkillInput): RetireSkillOutput {
  const { fileSystem, git } = io;
  const { repoBase, rootId, opts } = input;
  const names = [...new Set(input.names)];
  const fileTargets = [...new Set(input.files ?? [])].map(parseFileTarget);
  if (names.length === 0 && fileTargets.length === 0) {
    throw syncError(
      "EMPTY_SCOPE",
      "Nothing to retire.",
      null,
      "Name skills, or pass --target <root>:<path> for an excluded backup file.",
    );
  }
  for (const name of names) {
    if (!SKILL_NAME.test(name)) {
      throw syncError(
        "BROAD_SCOPE",
        `A retire names exact skill directories; got '${name}'.`,
        null,
        "Pass skill names without globs or path separators.",
      );
    }
  }
  const manifest = loadUnifiedManifest(io, repoBase);
  const root = rootId === null ? undefined : manifest.roots[rootId];
  if (names.length > 0 && (rootId === null || root?.kind !== "skill")) {
    throw syncError(
      "UNKNOWN_TARGET",
      `Unknown or non-skill root: ${rootId ?? "(none)"}`,
      null,
      "Use the id of a skill root with --root.",
    );
  }
  for (const name of names) {
    if (!manifest.entries.some((e) => e.kind === "skill" && e.root === rootId && e.path === name)) {
      throw syncError(
        "UNKNOWN_TARGET",
        `Skill '${name}' is not in the manifest for root ${rootId}.`,
        null,
        `Track it first: sync track skill ${name} --root ${rootId} --origin <authored|external> --no-sync`,
      );
    }
  }

  const prefix = git.repoPrefix(repoBase);
  const withFiles: string[] = [];
  const found: Array<{ file: string; label: string }> = [];
  if (root && rootId !== null) {
    const rootDir = path.join(repoBase, root.repoRoot);
    for (const name of names) {
      const files = fileSystem.getAllFiles(path.join(rootDir, name));
      if (files.length > 0) withFiles.push(name);
      for (const file of [
        ...files,
        ...pendingUnder(io, repoBase, prefix, `${root.repoRoot}/${name}/`),
      ]) {
        found.push({ file, label: `${rootId}:${path.relative(rootDir, file)}` });
      }
    }
  }
  const pruneFiles: string[] = [];
  for (const target of fileTargets) {
    const fileRoot = manifest.roots[target.rootId];
    if (!fileRoot) {
      throw syncError(
        "UNKNOWN_TARGET",
        `Unknown root in target '${target.raw}'.`,
        null,
        "Use <root>:<path> with a root id from the manifest.",
      );
    }
    const file = path.join(repoBase, fileRoot.repoRoot, target.rel);
    const present = fileSystem.exists(file);
    if (present && !isExcludedByPolicy(io, manifest, target.rootId, target.rel)) {
      throw syncError(
        "UNKNOWN_TARGET",
        `'${target.raw}' is still managed by the policy.`,
        null,
        `Exclude it first: sync untrack path ${target.rel} --root ${target.rootId}`,
      );
    }
    const pending = pendingFile(io, repoBase, prefix, `${fileRoot.repoRoot}/${target.rel}`);
    if (!present && !pending) {
      throw syncError(
        "EMPTY_SCOPE",
        `No backup copy or pending removal found for '${target.raw}'.`,
        null,
        "The backup holds nothing to retire at that path.",
      );
    }
    if (present) pruneFiles.push(target.raw);
    found.push({ file, label: target.raw });
  }
  const entries = [...new Map(found.map((item) => [item.file, item])).values()].sort((a, b) =>
    a.file.localeCompare(b.file),
  );
  if (entries.length === 0) {
    throw syncError(
      "EMPTY_SCOPE",
      `No backup copy or pending removal found for ${names.join(", ")}.`,
      null,
      "The backup holds nothing to retire for these skills.",
    );
  }

  const scope = git.previewPush(repoBase, [
    ...entries.map((item) => item.file),
    path.join(repoBase, MANIFEST_FILE),
  ]);
  const wantsGit = opts.gitPush === true;
  let blocked: ResultError | null = null;
  if (wantsGit && !scope) {
    blocked = { code: "GIT_FAILED", item: null, message: `Not a git repository: ${repoBase}` };
  } else if (wantsGit && scope && scope.unrelatedChanges.length > 0) {
    blocked = {
      code: "GIT_DIRTY_UNRELATED",
      item: null,
      message: `Unrelated changes in the backup repository block --git-push: ${scope.unrelatedChanges.join(", ")}`,
    };
  }
  let gitReport: GitReport | undefined = scope ?? undefined;
  if (scope && wantsGit) {
    // The retire edits the manifest only on apply, so a preview diffs the manifest as the apply will leave it.
    const retired: UnifiedManifest = {
      ...manifest,
      entries: manifest.entries.map(
        (entry): SyncEntry =>
          entry.kind === "skill" && entry.root === rootId && names.includes(entry.path)
            ? { ...entry, sync: false }
            : entry,
      ),
    };
    gitReport = { ...scope, manifestDiff: manifestDiffOf(io, repoBase, retired) };
  }

  const resolvedPaths = entries.map((item) => item.label);
  const roots = [
    ...new Set([...(rootId === null ? [] : [rootId]), ...fileTargets.map((t) => t.rootId)]),
  ];
  const envelope = (
    outcome: Result["outcome"],
    state: Result["actions"][number]["state"],
    recovery: string | null,
    errors: ResultError[] = [],
  ): Result => ({
    operation: "retire",
    scope: { roots, resolvedPaths },
    actions: entries.map((_, index) => ({ id: `a${index + 1}`, state })),
    outcome,
    errors,
    recovery,
    ...(gitReport ? { git: gitReport } : {}),
  });

  const apply = opts.apply === true;
  if (blocked) {
    const stopped = envelope(
      "failed",
      "not_attempted",
      "Resolve the Git state, then run the retire again. Nothing was changed.",
      [blocked],
    );
    return { phase: apply ? "apply" : "preview", result: stopped, extraLines: [] };
  }
  if (!apply) {
    return { phase: "preview", result: envelope("preview", "proposed", null), extraLines: [] };
  }

  for (const name of names) {
    if (rootId !== null) untrackEntry(io, { kind: "skill", name, rootId, repoBase, prune: true });
  }
  let result = envelope("success", "completed", null);
  const pruneTargets = [...withFiles.map((name) => `${rootId}:${name}`), ...pruneFiles];
  if (pruneTargets.length > 0) {
    const plan = buildPrunePlan(io, repoBase, { targets: pruneTargets });
    result = {
      ...executePlan(io, plan),
      operation: "retire",
      ...(gitReport ? { git: gitReport } : {}),
    };
  }
  const extraLines: string[] = [];
  if (wantsGit && scope && result.outcome === "success") {
    const pushed = git.commitAndPush(
      repoBase,
      scope.exportedPaths,
      opts.commitMessage ??
        `sync: retire ${[...names, ...fileTargets.map((t) => t.raw)].join(", ")}`,
    );
    if (pushed.success) extraLines.push(`🌐 git_push  ✔ ${pushed.output || "up to date"}`);
    else {
      result.outcome = "partial";
      result.errors.push({
        code: pushed.code,
        item: null,
        message: `git push failed: ${pushed.output}`,
      });
      result.recovery =
        "The backup copy is removed. Resolve the Git failure, then repeat the commit and push.";
    }
  }
  return { phase: "apply", result, extraLines };
}

interface FileTarget {
  raw: string;
  rootId: string;
  rel: string;
}

/** Splits `<root>:<path>`; the path is one exact file, never a glob or a path that leaves the root. */
function parseFileTarget(raw: string): FileTarget {
  const split = raw.indexOf(":");
  const rootId = split > 0 ? raw.slice(0, split) : "";
  const rel = split > 0 ? raw.slice(split + 1) : "";
  const segments = rel.split("/");
  if (
    rootId === "" ||
    rel === "" ||
    rel.startsWith("/") ||
    /[*?[\]{}]/.test(rel) ||
    segments.some((segment) => segment === ".." || segment === "." || segment === "")
  ) {
    throw syncError(
      "BROAD_SCOPE",
      `A retire names exact files as <root>:<path>; got '${raw}'.`,
      null,
      "Pass one exact file path per --target, without globs or dot segments.",
    );
  }
  return { raw, rootId, rel };
}

/** True when Git reports a pending change at exactly `fileRel` (Git-root-relative). */
function pendingFile(io: Io, repoBase: string, prefix: string | null, fileRel: string): boolean {
  if (prefix === null) return false;
  try {
    return io.git.inspectLocalState(repoBase).changedPaths.includes(`${prefix}${fileRel}`);
  } catch {
    return false;
  }
}

/** Absolute paths of pending Git changes under `skillRel` (Git-root-relative, ends with `/`). */
function pendingUnder(io: Io, repoBase: string, prefix: string | null, skillRel: string): string[] {
  if (prefix === null) return [];
  const under = `${prefix}${skillRel}`;
  try {
    return io.git
      .inspectLocalState(repoBase)
      .changedPaths.filter((file) => file.startsWith(under))
      .map((file) => path.join(repoBase, file.slice(prefix.length)));
  } catch {
    return [];
  }
}
