/** Text printed for `--help`, `help`, `-h`. */
export const usageText: string = `Usage: bun sync.ts <command> [repo_path] [options]

Commands:
  status                 Show synchronization status between local machine and repo
  inspect                List registered items: kind, root, path, shared|local-only policy, version label, local path
  diff                   Show unified diffs of modified files
  push [--apply]         Backup local files to repository (preview by default; --apply needs --target)
  pull [--apply]         Import repository files to local roots (preview by default; --apply needs --target)
  prune [--apply]        List backup copies of items the policy excludes; --apply --target removes only those
  apply <plan-file>      Recheck a saved plan; with --apply, execute it (rejects stale plans)
  root add|bind          Manage root paths and local machine bindings
  track path|skill       Track files or skills in the unified manifest
  untrack path|skill     Remove tracking policy; untrack skill --prune keeps it excluded so prune can remove its backup copy
  retire <skill...>      Remove skills from the backup: exclude, prune copies, and with --git-push commit and push exactly those paths plus the manifest; --target <root>:<path> adds an excluded backup file
  discover [--write]     Detect unlisted skills and paths
  bootstrap              Review installers of absent external skills; runs one only with --approve-install

Options:
  --apply                Execute file mutations (push and pull default to safe preview);
                         for push and pull it requires an explicit --target
  --format <tree|json>   Output format: human tree (default) or machine JSON result envelope
  --format=<tree|json>   Equals-form syntax for --format
  --git-pull             Pull remote git changes before restoring locally (with --apply)
  --git-push             Commit and push changes to remote git after backup
  --remove-stale         With push: also remove backup files in --target that have no local file and no
                         policy exclusion (shown in the preview; --git-push commits them with the copies)
  -m, --message <msg>    Git commit message when using --git-push
  --target <scope>       Select a root id, skill name, root-relative path, <root>:<path>, or glob;
                         exact or glob match only, repeatable
  --plan-out <file>      Save the push/pull preview as a change plan (outside backup and roots)
  --approve-install <root:skill>@<hash>
                         Let bootstrap run that skill's installer; <hash> is shown at review and must match the
                         current command (repeatable; nothing runs otherwise)
  --exclude <pattern>    Exclude matching paths from operation
  -h, --help             Show this help message`;

/** Printed when the command is not recognised. */
export const fallbackUsage: string = `Usage: bun sync.ts [status|inspect|discover|diff|resolve|merge|pull|push|prune|apply|init|root|track|untrack|retire|migrate-v2|bootstrap] [repo_path] [--root <id>] [--kind <path|skill>] [--repo-root <path>] [--local-root <path>] [--sync|--no-sync]`;
