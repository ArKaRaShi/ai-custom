import { createHash } from "node:crypto";
import * as path from "node:path";
import { isJsonObject } from "@/scripts/lib/manifest";

export type Digest =
  | { kind: "file"; sha256: string; mode: number }
  | { kind: "absent" }
  | { kind: "dir" }
  | { kind: "symlink"; target: string };

export type PlanOperation = "push" | "pull" | "prune";
export type ActionType = "copy" | "overwrite" | "delete" | "skip";

export interface PlanAction {
  id: string;
  type: ActionType;
  root: string;
  path: string;
  source: { location: string; digest: Digest };
  target: { location: string; digest: Digest };
}

export interface GitPlan {
  remoteUrlHash: string;
  remoteRef: string;
  remoteCommit: string;
  localHead: string;
  indexClean: boolean;
  worktreeClean: boolean;
  exportedPaths: string[];
  unrelatedChanges: string[];
}

export interface Plan {
  version: 1;
  operation: PlanOperation;
  repository: { path: string; headCommit: string | null };
  /**
   * `resolvedPaths` are `<root>:<path>` identities in action order.
   * `exclude` records the `--exclude` patterns that shaped the selection, so apply
   * recomputes the same scope. `removeStale` records that a push also removes stale backup
   * files, so apply recomputes the same selection.
   */
  scope: {
    roots: string[];
    targets: string[];
    resolvedPaths: string[];
    exclude?: string[];
    removeStale?: boolean;
  };
  policyHash: string;
  bindingsHash: string;
  actions: PlanAction[];
  git: GitPlan | null;
}

export type ErrorCode =
  | "EMPTY_SCOPE"
  | "BROAD_SCOPE"
  | "UNKNOWN_TARGET"
  | "PLAN_INVALID"
  | "PLAN_STALE_SCOPE"
  | "PLAN_STALE_POLICY"
  | "PLAN_STALE_SOURCE"
  | "PLAN_STALE_TARGET"
  | "PATH_ESCAPE"
  | "SYMLINK_UNSUPPORTED"
  | "GIT_DIRTY_UNRELATED"
  | "GIT_REMOTE_ADVANCED"
  | "GIT_CONFLICT"
  | "GIT_UNSUPPORTED_CONFIG"
  | "GIT_SIMULATION_FAILED"
  | "GIT_FAILED"
  | "IO_FAILED";

export type ActionState = "proposed" | "completed" | "failed" | "not_attempted";
export type Outcome = "preview" | "success" | "partial" | "failed";

export interface ResultError {
  code: ErrorCode;
  item: string | null;
  message: string;
}

/**
 * A registered item as seen by one machine. `path` is the manifest entry: a gitignore-style
 * pattern for file entries, a skill name for skills. `local` is that entry resolved through
 * this machine's root binding, or null when the root is unbound here. `version` is the recorded
 * label or null; it is never inferred. Skill-only fields are null when not recorded.
 */
export interface InspectItem {
  kind: "path" | "skill";
  root: string;
  path: string;
  policy: "shared" | "local-only";
  version: string | null;
  local: string | null;
  origin?: "authored" | "external";
  source?: string | null;
  install?: string | null;
  /** Bootstrap only: first 12 hex of the SHA-256 of `install`, binding an approval to the exact command. */
  installHash?: string;
}

/**
 * The manifest rule that decides a file's policy: `pattern` is a path entry's gitignore-style rule,
 * or a skill entry's name. `sync: false` means the policy excludes what it covers.
 */
export interface PolicyRule {
  kind: "path" | "skill";
  root: string;
  pattern: string;
  sync: boolean;
}

/**
 * Why a file differs between this machine and the backup, from facts the tool holds: local
 * presence, backup presence, content, and policy. It never says who changed the file or when.
 * - `only_local`: new locally; a push copies it.
 * - `differs`: both sides hold it with different content; a push overwrites the backup, a pull the local file.
 * - `only_backup`: in the backup, absent locally, not excluded; a pull restores it, `push --remove-stale` removes it.
 * - `excluded_backup_copy`: the policy excludes it; `prune` removes the backup copy.
 */
export type DriftCauseCode = "only_local" | "differs" | "only_backup" | "excluded_backup_copy";

/** One file that is not in sync (or is an excluded backup copy), with its cause and the policy that applies to it. */
export interface DriftFile {
  /** `<root>:<path>`, with `path` root-relative and `/`-separated. */
  id: string;
  cause: { code: DriftCauseCode; message: string };
  policy: { verdict: "managed" | "excluded"; rule: PolicyRule };
}

/** One manifest entry (or root) named in a manifest diff. A root's `path` is its backup `repoRoot`. */
export interface ManifestChange {
  kind: "path" | "skill" | "root";
  root: string;
  path: string;
  /** Changed entries only: `field: before → after` per differing field. */
  changes?: string[];
}

/**
 * What a Git step would export of `.ai-sync/manifest.json`: Git HEAD against the manifest as the
 * operation leaves it. `base: "none"` means HEAD holds no ai-sync v2 manifest, so every entry counts as added.
 */
export interface ManifestDiff {
  base: "head" | "none";
  added: ManifestChange[];
  removed: ManifestChange[];
  changed: ManifestChange[];
  lines: { added: number; removed: number };
}

/** Git facts a push or pull Result reports. Never holds a remote URL. */
export interface GitReport {
  /** Push: paths relative to the Git working-tree root that the push stages and commits. */
  exportedPaths?: string[];
  /** Staged, unstaged, or untracked changes outside the exported paths (push) or all pending changes (pull). */
  unrelatedChanges?: string[];
  remoteRef?: string;
  remoteCommit?: string;
  /** Pull: backup paths the remote integration would add, modify, or delete. */
  incoming?: { path: string; action: "add" | "modify" | "delete" }[];
  conflicts?: string[];
  /** Pull: why dependent restore actions cannot be determined exactly before the pull. */
  limitation?: string;
  /** Present when the manifest is exported, or has pending changes that block a push. */
  manifestDiff?: ManifestDiff;
}

export interface Result {
  operation: string;
  scope: { roots: string[]; resolvedPaths: string[] };
  /** `type` is present only for a removal (`delete`) on a push; every other action is a copy or overwrite. `excludedBy` is present on prune actions: the rule that excludes the backup copy. */
  actions: {
    id: string;
    state: ActionState;
    error?: string;
    type?: "delete";
    excludedBy?: PolicyRule;
  }[];
  outcome: Outcome;
  errors: ResultError[];
  recovery: string | null;
  /** Present for push and pull previews and applies that involve Git. */
  git?: GitReport;
  /** Present for inspection-style operations (`inspect`, `bootstrap`); aligned with `scope.resolvedPaths`. */
  items?: InspectItem[];
  /** Present for `status` and `inspect`: each drifting file with its cause. */
  drift?: DriftFile[];
}

/** A failure carrying the stable error codes that belong in a Result envelope. */
export class SyncError extends Error {
  readonly errors: ResultError[];
  readonly recovery: string | null;

  constructor(errors: ResultError[], recovery: string | null = null) {
    super(errors.map((e) => `${e.code}: ${e.message}`).join("\n"));
    this.name = "SyncError";
    this.errors = errors;
    this.recovery = recovery;
  }
}

export function syncError(
  code: ErrorCode,
  message: string,
  item: string | null = null,
  recovery: string | null = null,
): SyncError {
  return new SyncError([{ code, item, message }], recovery);
}

export function failureResult(operation: string, error: unknown): Result {
  const errors: ResultError[] =
    error instanceof SyncError
      ? error.errors
      : [
          {
            code: "IO_FAILED",
            item: null,
            message: error instanceof Error ? error.message : String(error),
          },
        ];
  return {
    operation,
    scope: { roots: [], resolvedPaths: [] },
    actions: [],
    outcome: "failed",
    errors,
    recovery: error instanceof SyncError ? error.recovery : null,
  };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
export function digestEquals(a: Digest, b: Digest): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export function describeDigest(digest: Digest): string {
  switch (digest.kind) {
    case "file":
      return `file ${digest.sha256.slice(0, 12)}`;
    case "symlink":
      return `symlink -> ${digest.target}`;
    default:
      return digest.kind;
  }
}

export function resolvedPathId(root: string, relPath: string): string {
  return `${root}:${relPath}`;
}

function invalid(message: string, item: string | null = null): SyncError {
  return syncError(
    "PLAN_INVALID",
    message,
    item,
    "Create a fresh plan with a preview and --plan-out.",
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** `null` for plans without Git steps; otherwise a pull plan's recorded remote and local Git state. */
function validateGitPlan(value: unknown, operation: PlanOperation): GitPlan | null {
  if (value === null) return null;
  if (!isJsonObject(value)) throw invalid("Invalid plan git state");
  if (operation !== "pull") throw invalid(`Only pull plans can carry Git steps, not ${operation}`);
  const {
    remoteUrlHash,
    remoteRef,
    remoteCommit,
    localHead,
    indexClean,
    worktreeClean,
    exportedPaths,
    unrelatedChanges,
  } = value;
  if (typeof remoteUrlHash !== "string" || !SHA256_HEX.test(remoteUrlHash))
    throw invalid("Invalid git remoteUrlHash");
  if (typeof remoteRef !== "string" || !remoteRef.startsWith("refs/"))
    throw invalid("Invalid git remoteRef");
  if (typeof remoteCommit !== "string" || !GIT_COMMIT.test(remoteCommit))
    throw invalid("Invalid git remoteCommit");
  if (typeof localHead !== "string" || !GIT_COMMIT.test(localHead))
    throw invalid("Invalid git localHead");
  if (typeof indexClean !== "boolean" || typeof worktreeClean !== "boolean")
    throw invalid("Invalid git cleanliness flags");
  if (!isStringArray(exportedPaths) || !isStringArray(unrelatedChanges))
    throw invalid("Invalid git path lists");
  return {
    remoteUrlHash,
    remoteRef,
    remoteCommit,
    localHead,
    indexClean,
    worktreeClean,
    exportedPaths,
    unrelatedChanges,
  };
}

function validateDigest(value: unknown, label: string): Digest {
  if (isJsonObject(value)) {
    if (value.kind === "absent" || value.kind === "dir") return { kind: value.kind };
    if (value.kind === "symlink" && typeof value.target === "string")
      return { kind: "symlink", target: value.target };
    if (
      value.kind === "file" &&
      typeof value.sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(value.sha256) &&
      typeof value.mode === "number"
    ) {
      return { kind: "file", sha256: value.sha256, mode: value.mode };
    }
  }
  throw invalid(`Invalid digest for ${label}`);
}

function validateEndpoint(value: unknown, label: string): { location: string; digest: Digest } {
  if (
    !isJsonObject(value) ||
    typeof value.location !== "string" ||
    !path.isAbsolute(value.location)
  )
    throw invalid(`Invalid ${label} location`);
  return { location: value.location, digest: validateDigest(value.digest, label) };
}

/** Relative, normalized, `/`-separated paths with no traversal. */
export function assertContainedRelative(value: string, label: string): void {
  const escapes =
    !value ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    /[\0\\]/.test(value) ||
    value.split("/").some((part) => part === ".." || part === "." || part === "");
  if (escapes)
    throw syncError("PATH_ESCAPE", `${label} is not a contained relative path: ${value}`, value);
}

/** Structural validation of untrusted plan data. Staleness is judged elsewhere. */
export function validatePlan(value: unknown): Plan {
  if (!isJsonObject(value) || value.version !== 1)
    throw invalid("Plan must be a JSON object with version 1");
  const operation = value.operation;
  if (operation !== "push" && operation !== "pull" && operation !== "prune")
    throw invalid(`Unsupported plan operation: ${String(operation)}`);
  const repository = value.repository;
  if (
    !isJsonObject(repository) ||
    typeof repository.path !== "string" ||
    !path.isAbsolute(repository.path) ||
    (repository.headCommit !== null && typeof repository.headCommit !== "string")
  ) {
    throw invalid("Invalid plan repository");
  }
  const scope = value.scope;
  if (
    !isJsonObject(scope) ||
    !isStringArray(scope.roots) ||
    !isStringArray(scope.targets) ||
    !isStringArray(scope.resolvedPaths) ||
    (scope.exclude !== undefined && !isStringArray(scope.exclude)) ||
    (scope.removeStale !== undefined && scope.removeStale !== true)
  ) {
    throw invalid("Invalid plan scope");
  }
  const removeStale = scope.removeStale === true;
  if (removeStale && operation !== "push") throw invalid("Only push plans can remove stale files");
  if (typeof value.policyHash !== "string" || typeof value.bindingsHash !== "string")
    throw invalid("Plan lacks policy or bindings hash");
  const git = validateGitPlan(value.git, operation);
  if (!Array.isArray(value.actions)) throw invalid("Plan actions must be an array");

  const ids = new Set<string>();
  const actions: PlanAction[] = value.actions.map((raw: unknown, index: number) => {
    if (
      !isJsonObject(raw) ||
      typeof raw.id !== "string" ||
      !/^a[1-9][0-9]*$/.test(raw.id) ||
      ids.has(raw.id)
    )
      throw invalid(`Invalid action id at position ${index + 1}`);
    ids.add(raw.id);
    const allowed: ActionType[] =
      operation === "prune"
        ? ["delete", "skip"]
        : operation === "push"
          ? ["copy", "overwrite", "delete", "skip"]
          : ["copy", "overwrite", "skip"];
    const type = allowed.find((candidate) => candidate === raw.type);
    if (type === undefined)
      throw invalid(`Unsupported action type for ${operation}: ${String(raw.type)}`, raw.id);
    if (
      typeof raw.root !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw.root) ||
      typeof raw.path !== "string"
    )
      throw invalid("Invalid action root or path", raw.id);
    assertContainedRelative(raw.path, `Action ${raw.id} path`);
    const source = validateEndpoint(raw.source, `${raw.id} source`);
    const target = validateEndpoint(raw.target, `${raw.id} target`);
    if (type === "delete" && target.digest.kind !== "file")
      throw invalid(`Delete action ${raw.id} must target a regular file`, raw.id);
    if (
      type === "delete" &&
      operation === "push" &&
      (!removeStale || source.digest.kind !== "absent")
    )
      throw invalid(
        `Push removal ${raw.id} needs a plan that removes stale files and no local counterpart`,
        raw.id,
      );
    return { id: raw.id, type, root: raw.root, path: raw.path, source, target };
  });

  const expectedPaths = actions.map((action) => resolvedPathId(action.root, action.path));
  const expectedRoots = [...new Set(actions.map((action) => action.root))].sort();
  if (
    canonicalJson(scope.resolvedPaths) !== canonicalJson(expectedPaths) ||
    canonicalJson([...scope.roots].sort()) !== canonicalJson(expectedRoots)
  ) {
    throw invalid("Plan scope does not match its actions");
  }
  return {
    version: 1,
    operation,
    repository: { path: repository.path, headCommit: repository.headCommit },
    scope: {
      roots: scope.roots,
      targets: scope.targets,
      resolvedPaths: scope.resolvedPaths,
      ...(scope.exclude !== undefined ? { exclude: scope.exclude } : {}),
      ...(removeStale ? { removeStale } : {}),
    },
    policyHash: value.policyHash,
    bindingsHash: value.bindingsHash,
    actions,
    git,
  };
}
