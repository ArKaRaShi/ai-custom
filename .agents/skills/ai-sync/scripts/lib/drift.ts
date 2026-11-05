import type { Io } from "@/scripts/io/io";
import type { UnifiedManifest } from "@/scripts/lib/manifest";
import {
  type DriftCauseCode,
  type DriftFile,
  type PolicyRule,
  resolvedPathId,
} from "@/scripts/lib/plan";
import {
  type EntryState,
  type ExcludedCopy,
  type PruneScan,
  type ScanEntry,
  type ScanResult,
  selectCopies,
  selectEntries,
} from "@/scripts/lib/scan";
import { matchesTarget, policyRuleOf } from "@/scripts/lib/target-matcher";
import type { TargetTest } from "@/scripts/lib/targets";

// Explains drift from facts the tool holds: local presence, backup presence, content, and policy.

/** `path rule 'config.yml' (sync: false)` or `skill entry 'mentor' (sync: false)`. */
export function describeRule(rule: PolicyRule): string {
  const subject = rule.kind === "path" ? "path rule" : "skill entry";
  return `${subject} '${rule.pattern}' (sync: ${rule.sync})`;
}

const SCAN_CAUSES: Record<
  Exclude<EntryState, "in_sync">,
  { code: DriftCauseCode; text: string }
> = {
  new_local: {
    code: "only_local",
    text: "New locally: the backup has no copy. push copies it.",
  },
  modified: {
    code: "differs",
    text: "Local and backup contents differ. push overwrites the backup copy; pull overwrites the local file.",
  },
  new_repo: {
    code: "only_backup",
    text: "In the backup with no local file, and the policy does not exclude it. pull restores it; push --remove-stale removes it.",
  },
};

/** The rule behind a file's verdict. Every scanned or excluded file has one, so a miss is a broken invariant. */
function ruleFor(io: Io, manifest: UnifiedManifest, root: string, relPath: string): PolicyRule {
  const rule = policyRuleOf(io, manifest, root, relPath);
  if (!rule) throw new Error(`No policy rule names ${resolvedPathId(root, relPath)}`);
  return rule;
}

/** Each file that is not in sync, plus each excluded backup copy, with its cause; sorted by `<root>:<path>`. */
export function driftFilesOf(
  io: Io,
  manifest: UnifiedManifest,
  entries: ScanEntry[],
  copies: ExcludedCopy[],
): DriftFile[] {
  const files: DriftFile[] = [];
  for (const entry of entries) {
    if (entry.state === "in_sync") continue;
    const cause = SCAN_CAUSES[entry.state];
    files.push({
      id: resolvedPathId(entry.root, entry.path),
      cause: { code: cause.code, message: cause.text },
      policy: { verdict: "managed", rule: ruleFor(io, manifest, entry.root, entry.path) },
    });
  }
  for (const copy of copies) {
    const rule = ruleFor(io, manifest, copy.root, copy.path);
    files.push({
      id: resolvedPathId(copy.root, copy.path),
      cause: {
        code: "excluded_backup_copy",
        message: `Excluded by the ${describeRule(rule)}. prune removes the backup copy.`,
      },
      policy: { verdict: "excluded", rule },
    });
  }
  return files.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface DriftSelection {
  entries: ScanEntry[];
  copies: ExcludedCopy[];
  /** Targets that match neither a managed file nor an excluded backup copy. */
  unknown: string[];
}

/** Narrows both scans by the same explicit targets; no targets selects everything. */
export function selectDrift(
  io: Io,
  scanned: ScanResult,
  pruned: PruneScan,
  targets: string[],
): DriftSelection {
  const test: TargetTest = (raw, candidate) => matchesTarget(io, raw, candidate);
  const fromEntries = selectEntries(scanned, targets, test);
  const fromCopies = selectCopies(pruned, targets, test);
  return {
    entries: fromEntries.selected,
    copies: fromCopies.selected,
    unknown: fromEntries.unknown.filter((raw) => fromCopies.unknown.includes(raw)),
  };
}
