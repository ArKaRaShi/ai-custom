import type { RootKind, SkillMetadata } from "@/scripts/domain/manifest";
import type { SyncOptions } from "@/scripts/domain/targets";

export interface TrackMeta {
  from?: string;
  version?: string;
  sync?: boolean;
  root?: string;
  kind?: RootKind;
  repoRoot?: string;
  localRoot?: string;
  origin?: SkillMetadata["origin"];
  sourceType?: string;
  install?: string;
  description?: string;
  entryPath?: string;
  help?: boolean;
}

export interface ParsedArgs {
  command: string;
  repo: string;
  opts: SyncOptions;
  args: string[];
  meta: TrackMeta;
}

/** Facts the parser needs from the outside world; supplied by the entry point. */
export interface ParseContext {
  /** Replaces a leading `~` in repo paths. */
  home?: string;
  /** Decides whether a bare positional names an existing path (repo) or a target. */
  pathExists?: (path: string) => boolean;
}

const NAMED_META = new Map<string, keyof TrackMeta>([
  ["--root", "root"],
  ["--kind", "kind"],
  ["--repo-root", "repoRoot"],
  ["--local-root", "localRoot"],
  ["--origin", "origin"],
  ["--source-type", "sourceType"],
  ["--install", "install"],
  ["--description", "description"],
  ["--path", "entryPath"],
]);

const NO_REPO_COMMANDS = ["track", "untrack", "root", "bootstrap", "discover", "apply"];

export function parseArgs(
  rawArgs: string[],
  defaultRepo: string,
  context: ParseContext = {},
): ParsedArgs {
  const home = context.home ?? "";
  const pathExists = context.pathExists ?? ((): boolean => false);
  const expand = (value: string): string => value.replace(/^~/, home);

  let command = "status";
  let repo = defaultRepo;
  const exclude: string[] = [];
  const targets: string[] = [];
  const approve: string[] = [];
  const opts: SyncOptions = { exclude, targets };
  const meta: TrackMeta = {};
  const positional: string[] = [];
  const next = (i: number): string | undefined => rawArgs[i + 1];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i] as string;
    const value = next(i);
    const option = NAMED_META.get(arg);
    if (option && value !== undefined) {
      (meta[option] as string | undefined) = value;
      i++;
    } else if (arg === "--exclude" || arg === "-x") {
      if (value !== undefined) {
        exclude.push(value);
        i++;
      }
    } else if (arg.startsWith("--exclude=")) exclude.push(arg.slice("--exclude=".length));
    else if (arg === "--target" || arg === "-t") {
      if (value !== undefined) {
        targets.push(value);
        i++;
      }
    } else if (arg.startsWith("--target=")) targets.push(arg.slice("--target=".length));
    else if (arg === "--plan-out") {
      if (value !== undefined) {
        opts.planOut = value;
        i++;
      }
    } else if (arg.startsWith("--plan-out=")) opts.planOut = arg.slice("--plan-out=".length);
    else if (arg === "--format") {
      if (value !== undefined) {
        opts.format = value as "tree" | "json";
        i++;
      }
    } else if (arg.startsWith("--format="))
      opts.format = arg.slice("--format=".length) as "tree" | "json";
    else if (arg === "--apply") opts.apply = true;
    else if (arg === "-h" || arg === "--help") meta.help = true;
    else if (arg === "--git-pull") opts.gitPull = true;
    else if (arg === "--no-git-pull") opts.gitPull = false;
    else if (arg === "--git-push") opts.gitPush = true;
    else if (arg === "--no-git-push") opts.gitPush = false;
    else if (arg === "-m" || arg === "--message") {
      if (value !== undefined) {
        opts.commitMessage = value;
        i++;
      }
    } else if (arg.startsWith("--message=")) opts.commitMessage = arg.slice("--message=".length);
    else if (arg === "--include-local") opts.includeLocal = true;
    else if (arg === "--approve-install") {
      if (value !== undefined) {
        approve.push(value);
        i++;
      }
    } else if (arg.startsWith("--approve-install="))
      approve.push(arg.slice("--approve-install=".length));
    else if (arg === "--write") opts.write = true;
    else if (arg === "--sync") meta.sync = true;
    else if (arg === "--no-sync") meta.sync = false;
    else if (arg === "--from" && value !== undefined) {
      meta.from = value;
      i++;
    } else if (arg.startsWith("--from=")) meta.from = arg.slice("--from=".length);
    else if (arg === "--version" && value !== undefined) {
      meta.version = value;
      i++;
    } else if (arg.startsWith("--version=")) meta.version = arg.slice("--version=".length);
    else if (!arg.startsWith("-")) positional.push(arg);
  }

  if (approve.length > 0) opts.approveInstall = approve;
  if (positional[0]) command = positional[0];
  const rest = positional.slice(1);
  const first = rest[0];
  if (command === "init" && first) repo = expand(first);
  else if (!NO_REPO_COMMANDS.includes(command) && first) {
    if (first.startsWith("/") || first.startsWith("~") || pathExists(first)) repo = expand(first);
    else if (targets.length === 0) targets.push(first);
  }
  return { command, repo, opts, args: rest, meta };
}
