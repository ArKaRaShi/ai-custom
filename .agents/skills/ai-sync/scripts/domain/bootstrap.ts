import { createHash } from "node:crypto";
import * as path from "node:path";
import { inspectItem } from "@/scripts/domain/inspect";
import type { Locations, ResolvedRoot, UnifiedManifest } from "@/scripts/domain/manifest";
import {
  type InspectItem,
  type Outcome,
  type ResultError,
  resolvedPathId,
  SyncError,
} from "@/scripts/domain/plan";

export interface PendingInstall {
  /** `<root>:<skill>` identity */
  id: string;
  item: InspectItem;
  command: string;
  /** first 12 hex of the SHA-256 of `command`; the approval token is `<id>@<hash>` */
  hash: string;
}

/** Short fingerprint of the exact installer command string, shown at review and required at approval. */
export function installHash(command: string): string {
  return createHash("sha256").update(command).digest("hex").slice(0, 12);
}

/**
 * External sync-off skills absent on this machine. The command is the recorded installer, or
 * the documented `skills add` form derived from a recorded source. Skills with neither are
 * returned in `manual`: ai-sync cannot name a command for them and never invents one.
 */
export function findPendingInstalls(
  manifest: UnifiedManifest,
  roots: ResolvedRoot[],
  locations: Locations,
  exists: (file: string) => boolean,
): { pending: PendingInstall[]; manual: string[] } {
  const pending: PendingInstall[] = [];
  const manual: string[] = [];
  for (const entry of manifest.entries) {
    if (entry.kind !== "skill" || entry.sync || entry.skill.origin !== "external") continue;
    const root = roots.find((item) => item.id === entry.root);
    if (!root) throw new Error(`Missing resolved skill root: ${entry.root}`);
    if (exists(path.join(root.local, entry.path))) continue;
    const id = resolvedPathId(entry.root, entry.path);
    const command =
      entry.skill.install ||
      (entry.skill.source ? `npx -y skills add ${entry.skill.source} -g` : null);
    if (!command) manual.push(id);
    else {
      pending.push({
        id,
        item: {
          ...inspectItem(entry, locations),
          install: command,
          installHash: installHash(command),
        },
        command,
        hash: installHash(command),
      });
    }
  }
  return { pending, manual };
}

export interface ApprovalReview {
  /** Ids of pending installers whose token named the current command hash. */
  approved: Set<string>;
  rejected: ResultError[];
  /** Corrected `<id>@<hash>` tokens for rejected approvals that can be retried. */
  retry: string[];
}

/** Checks every `--approve-install` token against the pending installers and their current hashes. */
export function reviewApprovals(pending: PendingInstall[], tokens: string[]): ApprovalReview {
  const approved = new Set<string>();
  const rejected: ResultError[] = [];
  const retry: string[] = [];
  for (const token of tokens) {
    const at = token.lastIndexOf("@");
    const id = at < 0 ? token : token.slice(0, at);
    const hash = at < 0 ? null : token.slice(at + 1);
    const install = pending.find((candidate) => candidate.id === id);
    if (!install) {
      rejected.push({
        code: "UNKNOWN_TARGET",
        item: id,
        message: `'${id}' is not a pending installer: it must be an external, local-only skill with an installer that is missing on this machine.`,
      });
    } else if (hash === null || hash === "") {
      rejected.push({
        code: "PLAN_INVALID",
        item: id,
        message: `Approval for '${id}' must name the reviewed command hash as ${id}@<hash>.`,
      });
      retry.push(`${id}@${install.hash}`);
    } else if (hash !== install.hash) {
      rejected.push({
        code: "PLAN_STALE_POLICY",
        item: id,
        message: `The installer command for '${id}' differs from the one approved (hash ${hash}, now ${install.hash}).`,
      });
      retry.push(`${id}@${install.hash}`);
    } else {
      approved.add(id);
    }
  }
  return { approved, rejected, retry };
}

/** The error raised when any approval is rejected; nothing has run at that point. */
export function approvalRejection(review: ApprovalReview): SyncError {
  return new SyncError(
    review.rejected,
    review.retry.length > 0
      ? `Nothing was run. Review the current command, then rerun with --approve-install ${review.retry.join(" --approve-install ")}.`
      : "Nothing was run. Run bootstrap without --approve-install to list the pending installers and their approval tokens.",
  );
}

/** Overall outcome: a preview when nothing was approved, otherwise by completed and failed installers. */
export function bootstrapOutcome(
  approvedCount: number,
  errorCount: number,
  completed: number,
): Outcome {
  if (approvedCount === 0) return "preview";
  if (errorCount === 0) return "success";
  return completed > 0 ? "partial" : "failed";
}

/** Recovery text for the bootstrap Result, or null when there is nothing to add. */
export function bootstrapRecovery(
  failure: PendingInstall | undefined,
  approvedCount: number,
  pendingCount: number,
  manual: string[],
): string | null {
  const notes: string[] = [];
  if (failure) {
    notes.push(
      `Run the command yourself and review its output: ${failure.command}. Completed installers stay in place.`,
    );
  } else if (approvedCount === 0 && pendingCount > 0) {
    notes.push(
      "Review the commands, then repeat with --approve-install <root:skill>@<hash> for each installer you approve.",
    );
  }
  if (manual.length > 0) {
    notes.push(`No installer is recorded for ${manual.join(", ")}; install manually.`);
  }
  return notes.length > 0 ? notes.join(" ") : null;
}
