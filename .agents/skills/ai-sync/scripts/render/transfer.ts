import type { TransferChangesOutput } from "@/scripts/commands/transfer-changes";
import type { Plan, Result } from "@/scripts/lib/plan";
import { gitNotes, isStaleRemoval, PRUNE_CAVEAT, TRANSFER_WORDS } from "@/scripts/lib/plan-rules";
import type { SyncOptions } from "@/scripts/lib/targets";
import { printErrors, printJson } from "./common";

/** The preview tree for a plan with actions; `notes` appear above the file list. */
export function printPreviewTree(plan: Plan, planFile: string | undefined, notes: string[]): void {
  const operation = plan.operation;
  const words = TRANSFER_WORDS[operation];
  console.log(`ai-sync:${operation} [preview]`);
  console.log(`  ├─ repo_root  ${plan.repository.path}`);
  for (const note of notes) console.log(`  ├─ note       ${note}`);
  if (plan.operation === "prune") {
    console.log(`  ├─ note       local files and unselected backup content stay untouched`);
    console.log(`  ├─ note       ${PRUNE_CAVEAT}`);
  }
  const removals = plan.actions.filter((action) => isStaleRemoval(plan, action)).length;
  console.log(`  ├─ to_${words.noun}  ${plan.actions.length - removals} file(s)`);
  if (removals > 0) console.log(`  ├─ to_remove  ${removals} stale backup file(s)`);
  for (const action of plan.actions) {
    const suffix =
      action.type === "skip"
        ? " (skipped: symlink is never followed)"
        : isStaleRemoval(plan, action)
          ? " (remove: backup file has no local counterpart)"
          : "";
    console.log(`  │  ├─ ${action.root}:${action.path}${suffix}`);
  }
  if (planFile) console.log(`  ├─ plan_out   ${planFile}`);
  console.log(`  └─ action     none (preview only; run with --apply to ${words.noun})`);
}

/** The apply tree: one line per action, then `extraLines`, then the status line and any errors. */
export function printApplyTree(plan: Plan, result: Result, extraLines: string[]): void {
  const operation = plan.operation;
  const words = TRANSFER_WORDS[operation];
  console.log(`ai-sync:${operation} [apply]`);
  console.log(`  ├─ repo_root  ${plan.repository.path}`);
  plan.actions.forEach((action, index) => {
    const state = result.actions[index];
    const label = `${action.root}:${action.path}`;
    if (state?.state === "completed")
      console.log(`  │  ✔ ${isStaleRemoval(plan, action) ? "removed" : words.done}: ${label}`);
    else if (state?.state === "failed")
      console.log(`  │  ✖ failed: ${label}: ${state.error ?? ""}`);
    else console.log(`  │  · not attempted: ${label}`);
  });
  for (const line of extraLines) console.log(`  │  ${line}`);
  if (plan.operation === "prune") console.log(`  │  ${PRUNE_CAVEAT}`);
  const completed = result.actions.filter((action) => action.state === "completed");
  const removed = completed.filter((action) => action.type === "delete").length;
  // A push reports its removals apart from its copies; a prune's actions are all removals already.
  const counted = plan.operation === "push" ? completed.length - removed : completed.length;
  const removals = plan.operation === "push" && removed > 0 ? `; ${removed} stale removed` : "";
  console.log(
    result.outcome === "success"
      ? `  └─ status     ✔ ${words.summary(counted)}${removals}`
      : `  └─ status     ✖ ${result.outcome} (${completed.length} of ${result.actions.length} actions completed)`,
  );
  printErrors(result);
}

/** The tree for a Git step that stopped before any file action ran. */
export function printGitStopped(plan: Plan, result: Result, phase: "preview" | "apply"): void {
  console.log(`ai-sync:${plan.operation} [${phase}]`);
  console.log(`  ├─ repo_root  ${plan.repository.path}`);
  for (const note of gitNotes(result.git)) console.log(`  ├─ note       ${note}`);
  console.log(`  └─ status     ✖ Git step blocked; no files were changed`);
  printErrors(result);
}

/** Prints a push or pull outcome: the JSON envelope for `--format=json`, the tree otherwise. */
export function renderTransfer(output: TransferChangesOutput, format: SyncOptions["format"]): void {
  const { plan, result } = output;
  if (format === "json") {
    printJson(result);
    return;
  }
  switch (output.kind) {
    case "git-stopped":
      printGitStopped(plan, result, output.phase);
      return;
    case "preview":
      if (plan.actions.length === 0) {
        const noun = TRANSFER_WORDS[plan.operation].noun;
        console.log(`ai-sync:${plan.operation} [preview]`);
        console.log(`  ├─ repo_root  ${plan.repository.path}`);
        for (const note of output.notes) console.log(`  ├─ note       ${note}`);
        console.log(`  ├─ to_${noun}  0 file(s)`);
        console.log(`  └─ status     ✔ nothing to ${noun} (in sync)`);
      } else printPreviewTree(plan, output.planFile, output.notes);
      return;
    case "applied":
      printApplyTree(plan, result, output.extraLines);
      return;
  }
}
