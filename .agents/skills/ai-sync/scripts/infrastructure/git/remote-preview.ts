import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type IncomingChange,
  type LocalGitState,
  type PreviewBlockCode,
  type PreviewOptions,
  parseNameStatus,
  pathsOverlap,
  type RemoteIntegrationPreview,
  type RevalidationCode,
  type RevalidationResult,
  sortedUnique,
} from "@/scripts/domain/git";
import type { GitPlan } from "@/scripts/domain/plan";
import { findRemoteByHash, inspectLocalGitState, sha256 } from "./local-state";
import { runGit } from "./run-git";

/**
 * Remote integration preview and pre-apply revalidation.
 *
 * The preview never fetches into, or writes to, the real repository: remote objects are
 * fetched into a disposable bare repository that borrows the real object store read-only
 * through `objects/info/alternates`. Every Git call here runs with optional locks disabled so
 * that even `git status` cannot refresh the real index.
 *
 * Remote URLs may carry credentials. They are only ever hashed or passed to Git; nothing
 * derived from remote-facing stderr is returned, because Git echoes URLs and hosts.
 */

class Blocked extends Error {
  constructor(
    readonly code: PreviewBlockCode,
    reason: string,
  ) {
    super(reason);
  }
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

function gitOut(
  cwd: string,
  args: string[],
  failure: Blocked,
  env: NodeJS.ProcessEnv = {},
): string {
  const run = runGit(cwd, args, env);
  if (run.status !== 0) throw failure;
  return run.stdout.trim();
}

function configValue(repo: string, key: string): string | undefined {
  const run = runGit(repo, ["config", "--get", key]);
  return run.status === 0 ? run.stdout.trim() : undefined;
}

function configKeys(repo: string, pattern: string): string[] {
  const run = runGit(repo, ["config", "--get-regexp", pattern]);
  return run.status === 0
    ? run.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split(/\s/)[0] ?? "")
    : [];
}

const FALSE_VALUES = ["false", "no", "off", "0", ""];
const TRUE_VALUES = ["true", "yes", "on", "1"];

function isFalse(value: string | undefined): boolean {
  return value === undefined || FALSE_VALUES.includes(value.toLowerCase());
}

function checkRepository(repo: string): void {
  const top = runGit(repo, ["rev-parse", "--show-toplevel"]);
  const notRepo = new Blocked("GIT_SIMULATION_FAILED", "Not the root of a Git working tree");
  if (top.status !== 0) throw notRepo;
  let real: string;
  try {
    real = fs.realpathSync(repo);
  } catch {
    throw notRepo;
  }
  if (fs.realpathSync(top.stdout.trim()) !== real) throw notRepo;
}

function checkLocalConfig(repo: string, branch: string | null): void {
  const unsupported = (reason: string): Blocked => new Blocked("GIT_UNSUPPORTED_CONFIG", reason);
  if (
    gitOut(
      repo,
      ["rev-parse", "--is-shallow-repository"],
      unsupported("Cannot read shallow state"),
    ) === "true"
  ) {
    throw unsupported("Shallow clones are not supported");
  }
  if (!isFalse(configValue(repo, "pull.rebase"))) {
    throw unsupported("pull.rebase must be unset or false");
  }
  if (branch && !isFalse(configValue(repo, `branch.${branch}.rebase`))) {
    throw unsupported(`branch.${branch}.rebase must be unset or false`);
  }
  const ff = configValue(repo, "pull.ff");
  if (ff !== undefined && ff !== "only") throw unsupported("pull.ff must be unset or only");
  if (configValue(repo, "core.hooksPath") !== undefined) {
    throw unsupported("core.hooksPath is not supported");
  }
  if (configKeys(repo, "^filter\\.").length > 0) {
    throw unsupported("filter.* configuration is not supported");
  }
  if (!isFalse(configValue(repo, "core.autocrlf"))) {
    throw unsupported("core.autocrlf must be unset or false");
  }
  const sparse = configValue(repo, "core.sparseCheckout");
  const gitDir = gitOut(
    repo,
    ["rev-parse", "--absolute-git-dir"],
    unsupported("Cannot locate git directory"),
  );
  if (
    (sparse !== undefined && TRUE_VALUES.includes(sparse.toLowerCase())) ||
    fs.existsSync(path.join(gitDir, "info", "sparse-checkout"))
  ) {
    throw unsupported("Sparse checkout is not supported");
  }
  if (fs.existsSync(path.join(repo, ".gitmodules"))) {
    throw unsupported(".gitmodules is not supported");
  }
}

function treeHas(
  gitDir: string,
  commit: string,
  file: string,
  env: NodeJS.ProcessEnv = {},
): boolean {
  return runGit(gitDir, ["cat-file", "-e", `${commit}:${file}`], env).status === 0;
}

function treeHasSymlink(cwd: string, commit: string, env: NodeJS.ProcessEnv = {}): boolean {
  const run = runGit(cwd, ["ls-tree", "-r", commit], env);
  return run.stdout.split("\n").some((line) => line.startsWith("120000 "));
}

function selectRemote(repo: string, requested: string | undefined): string {
  const remotes = runGit(repo, ["remote"]).stdout.split("\n").filter(Boolean);
  if (requested !== undefined) {
    if (!remotes.includes(requested)) {
      throw new Blocked("GIT_UNSUPPORTED_CONFIG", "The requested remote is not configured");
    }
    return requested;
  }
  const only = remotes[0];
  if (remotes.length !== 1 || only === undefined) {
    throw new Blocked(
      "GIT_UNSUPPORTED_CONFIG",
      remotes.length === 0
        ? "No remote is configured"
        : "Several remotes are configured; name one explicitly",
    );
  }
  return only;
}

function remoteUrl(repo: string, remote: string): string {
  const url = runGit(repo, ["remote", "get-url", remote]);
  if (url.status !== 0) throw new Blocked("GIT_SIMULATION_FAILED", "Cannot resolve the remote URL");
  return url.stdout.trim();
}

function resolveRef(
  repo: string,
  remote: string,
  branch: string | null,
  requested: string | undefined,
): string {
  let ref = requested;
  if (ref === undefined && branch) {
    const upstreamRemote = configValue(repo, `branch.${branch}.remote`);
    const merge = configValue(repo, `branch.${branch}.merge`);
    if (merge && (upstreamRemote === undefined || upstreamRemote === remote)) ref = merge;
    else ref = `refs/heads/${branch}`;
  }
  if (ref === undefined) {
    throw new Blocked("GIT_UNSUPPORTED_CONFIG", "Detached HEAD: name the remote ref explicitly");
  }
  const full = ref.startsWith("refs/") ? ref : `refs/heads/${ref}`;
  if (runGit(repo, ["check-ref-format", full]).status !== 0) {
    throw new Blocked("GIT_SIMULATION_FAILED", "Invalid remote ref name");
  }
  return full;
}

function fetchableUrl(repo: string, url: string): string {
  return /^\.\.?(\/|$)/.test(url) ? path.resolve(repo, url) : url;
}

interface Simulation {
  kind: "up-to-date" | "fast-forward" | "merge";
  remoteCommit: string;
  incoming: IncomingChange[];
  conflicts: string[];
}

function simulate(repo: string, remote: string, ref: string, localHead: string): Simulation {
  const failed = (reason: string): Blocked => new Blocked("GIT_SIMULATION_FAILED", reason);
  const url = fetchableUrl(repo, remoteUrl(repo, remote));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-git-preview-"));
  try {
    const gitDir = path.join(tmp, "preview.git");
    const env = { GIT_DIR: gitDir };
    const format = gitOut(
      repo,
      ["rev-parse", "--show-object-format"],
      failed("Cannot read object format"),
    );
    const objects = gitOut(
      repo,
      ["rev-parse", "--path-format=absolute", "--git-path", "objects"],
      failed("Cannot locate object store"),
    );
    if (
      runGit(tmp, ["init", "--bare", "-q", "--template=", `--object-format=${format}`, gitDir])
        .status !== 0
    ) {
      throw failed("Cannot create the temporary repository");
    }
    fs.mkdirSync(path.join(gitDir, "objects", "info"), { recursive: true });
    fs.writeFileSync(path.join(gitDir, "objects", "info", "alternates"), `${objects}\n`);
    if (runGit(tmp, ["update-ref", "refs/preview/local", localHead], env).status !== 0) {
      throw failed("Cannot import the local HEAD");
    }

    const fetch = runGit(
      tmp,
      [
        "-c",
        "gc.auto=0",
        "-c",
        "maintenance.auto=false",
        "fetch",
        "--quiet",
        "--no-tags",
        url,
        `+${ref}:refs/preview/remote`,
      ],
      env,
    );
    if (fetch.status !== 0) {
      throw failed(`Cannot fetch ${ref} from the remote (git exit ${fetch.status})`);
    }
    const remoteCommit = gitOut(
      tmp,
      ["rev-parse", "--verify", "refs/preview/remote^{commit}"],
      failed("Fetched ref is not a commit"),
      env,
    );

    if (
      treeHas(gitDir, localHead, ".gitmodules", env) ||
      treeHas(gitDir, remoteCommit, ".gitmodules", env)
    ) {
      throw new Blocked("GIT_UNSUPPORTED_CONFIG", ".gitmodules is not supported");
    }
    const symlinks = configValue(repo, "core.symlinks");
    if (
      symlinks !== undefined &&
      isFalse(symlinks) &&
      (treeHasSymlink(tmp, localHead, env) || treeHasSymlink(tmp, remoteCommit, env))
    ) {
      throw new Blocked(
        "GIT_UNSUPPORTED_CONFIG",
        "core.symlinks=false with tracked symlinks is not supported",
      );
    }

    const isAncestor = (ancestor: string, descendant: string): boolean => {
      const run = runGit(tmp, ["merge-base", "--is-ancestor", ancestor, descendant], env);
      if (run.status !== 0 && run.status !== 1) throw failed("Cannot compare histories");
      return run.status === 0;
    };
    if (isAncestor(remoteCommit, localHead)) {
      return { kind: "up-to-date", remoteCommit, incoming: [], conflicts: [] };
    }

    const diff = (from: string, to: string): IncomingChange[] => {
      const run = runGit(
        tmp,
        ["diff", "--name-status", "-z", "--no-renames", "--no-ext-diff", from, to],
        env,
      );
      if (run.status !== 0) throw failed("Cannot compute incoming changes");
      return parseNameStatus(run.stdout);
    };
    if (isAncestor(localHead, remoteCommit)) {
      return {
        kind: "fast-forward",
        remoteCommit,
        incoming: diff(localHead, remoteCommit),
        conflicts: [],
      };
    }

    if (configValue(repo, "pull.ff") === "only") {
      throw failed("Histories diverged and pull.ff=only forbids a merge");
    }
    const merged = runGit(
      tmp,
      ["merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", localHead, remoteCommit],
      env,
    );
    if (merged.status !== 0 && merged.status !== 1) throw failed("Cannot simulate the merge");
    const [tree, ...rest] = merged.stdout.split("\0");
    if (!tree) throw failed("Merge simulation produced no result");
    const conflicts = merged.status === 1 ? sortedUnique(rest.filter(Boolean)) : [];
    return { kind: "merge", remoteCommit, incoming: diff(localHead, tree), conflicts };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Simulates `git pull` of a remote ref against the real repository's current HEAD, index and
 * working tree, in a disposable repository. The real repository is only read.
 */
export function previewRemoteIntegration(
  repo: string,
  options: PreviewOptions = {},
): RemoteIntegrationPreview {
  const preview: RemoteIntegrationPreview = {
    remoteUrlHash: "",
    remoteRef: "",
    remoteCommit: "",
    localHead: "",
    indexClean: false,
    worktreeClean: false,
    incoming: [],
    conflicts: [],
    blocked: null,
  };
  try {
    checkRepository(repo);
    let state: LocalGitState;
    try {
      state = inspectLocalGitState(repo);
    } catch {
      throw new Blocked("GIT_SIMULATION_FAILED", "Cannot read local Git state");
    }
    preview.localHead = state.localHead;
    preview.indexClean = state.indexClean;
    preview.worktreeClean = state.worktreeClean;

    const branchRun = runGit(repo, ["symbolic-ref", "-q", "--short", "HEAD"]);
    const branch = branchRun.status === 0 ? firstLine(branchRun.stdout) : null;
    checkLocalConfig(repo, branch);
    if (!state.localHead) {
      throw new Blocked("GIT_SIMULATION_FAILED", "The repository has no commits yet");
    }

    const remote = selectRemote(repo, options.remote);
    preview.remoteUrlHash = sha256(remoteUrl(repo, remote));
    preview.remoteRef = resolveRef(repo, remote, branch, options.ref);

    const simulation = simulate(repo, remote, preview.remoteRef, state.localHead);
    preview.remoteCommit = simulation.remoteCommit;
    preview.incoming = simulation.incoming;
    preview.conflicts = simulation.conflicts;

    if (simulation.conflicts.length > 0) {
      throw new Blocked(
        "GIT_CONFLICT",
        `Merge conflicts in: ${simulation.conflicts.slice(0, 5).join(", ")}`,
      );
    }
    const overlap = simulation.incoming.filter((change) =>
      state.changedPaths.some((file) => pathsOverlap(file, change.path)),
    );
    if (overlap.length > 0) {
      throw new Blocked(
        "GIT_DIRTY_UNRELATED",
        `Local changes overlap incoming paths: ${overlap
          .slice(0, 5)
          .map((change) => change.path)
          .join(", ")}`,
      );
    }
    if (simulation.kind === "merge" && !state.indexClean) {
      throw new Blocked(
        "GIT_DIRTY_UNRELATED",
        "Staged changes block a merge of diverged histories",
      );
    }
  } catch (error) {
    if (error instanceof Blocked) preview.blocked = { code: error.code, reason: error.message };
    else {
      preview.blocked = {
        code: "GIT_SIMULATION_FAILED",
        reason: "Unexpected failure while simulating the integration",
      };
    }
  }
  return preview;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function reject(code: RevalidationCode, reason: string): RevalidationResult {
  return { ok: false, code, reason };
}

/**
 * Re-checks the saved remote commit and local state immediately before apply.
 * Nothing is fetched into or written to the real repository.
 */
export function revalidateGitState(repo: string, saved: GitPlan): RevalidationResult {
  const remote = findRemoteByHash(repo, saved.remoteUrlHash);
  if (!remote)
    return reject("GIT_SIMULATION_FAILED", "No configured remote matches the saved plan");

  const lsRemote = runGit(repo, ["ls-remote", remote, saved.remoteRef]);
  if (lsRemote.status !== 0) {
    return reject(
      "GIT_SIMULATION_FAILED",
      `Cannot resolve the remote ref (git exit ${lsRemote.status})`,
    );
  }
  const line = lsRemote.stdout.split("\n").find((entry) => entry.endsWith(`\t${saved.remoteRef}`));
  if (!line) return reject("GIT_SIMULATION_FAILED", "The remote ref no longer exists");
  const current = line.split("\t")[0] ?? "";
  if (current !== saved.remoteCommit) {
    return reject(
      "GIT_REMOTE_ADVANCED",
      `Remote ${saved.remoteRef} moved from ${saved.remoteCommit.slice(0, 12)} to ${current.slice(0, 12)}`,
    );
  }

  let state: LocalGitState;
  try {
    state = inspectLocalGitState(repo, saved.exportedPaths);
  } catch {
    return reject("GIT_SIMULATION_FAILED", "Cannot read local Git state");
  }
  if (state.localHead !== saved.localHead) {
    return reject(
      "GIT_DIRTY_UNRELATED",
      `Local HEAD moved from ${saved.localHead.slice(0, 12)} to ${state.localHead.slice(0, 12)}`,
    );
  }
  if (!sameList(state.unrelatedChanges, [...saved.unrelatedChanges].sort())) {
    const savedSet = new Set(saved.unrelatedChanges);
    const nowSet = new Set(state.unrelatedChanges);
    const differing = [
      ...state.unrelatedChanges.filter((file) => !savedSet.has(file)),
      ...saved.unrelatedChanges.filter((file) => !nowSet.has(file)),
    ];
    return reject(
      "GIT_DIRTY_UNRELATED",
      `Unrelated local changes differ from the saved plan: ${differing.slice(0, 5).join(", ")}`,
    );
  }
  if (state.indexClean !== saved.indexClean || state.worktreeClean !== saved.worktreeClean) {
    return reject("GIT_DIRTY_UNRELATED", "Index or working-tree state differs from the saved plan");
  }

  const preview = previewRemoteIntegration(repo, { remote, ref: saved.remoteRef });
  if (preview.blocked) {
    const { code, reason } = preview.blocked;
    if (code === "GIT_CONFLICT" || code === "GIT_DIRTY_UNRELATED") return reject(code, reason);
    return reject("GIT_SIMULATION_FAILED", reason);
  }
  if (preview.remoteCommit !== saved.remoteCommit) {
    return reject("GIT_REMOTE_ADVANCED", "Remote moved while revalidating");
  }
  return { ok: true };
}
