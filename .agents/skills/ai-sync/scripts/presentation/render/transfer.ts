import type { TransferChangesOutput } from "@/scripts/application/use-cases/transfer-changes";
import type { Plan, Result } from "@/scripts/domain/plan";
import { gitNotes, PRUNE_CAVEAT, TRANSFER_WORDS } from "@/scripts/domain/plan-rules";
import type { SyncOptions } from "@/scripts/domain/targets";
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
  console.log(`  ├─ to_${words.noun}  ${plan.actions.length} file(s)`);
  for (const action of plan.actions) {
    console.log(
      `  │  ├─ ${action.root}:${action.path}${action.type === "skip" ? " (skipped: symlink is never followed)" : ""}`,
    );
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
    if (state?.state === "completed") console.log(`  │  ✔ ${words.done}: ${label}`);
    else if (state?.state === "failed")
      console.log(`  │  ✖ failed: ${label}: ${state.error ?? ""}`);
    else console.log(`  │  · not attempted: ${label}`);
  });
  for (const line of extraLines) console.log(`  │  ${line}`);
  if (plan.operation === "prune") console.log(`  │  ${PRUNE_CAVEAT}`);
  const completed = result.actions.filter((action) => action.state === "completed").length;
  console.log(
    result.outcome === "success"
      ? `  └─ status     ✔ ${words.summary(completed)}`
      : `  └─ status     ✖ ${result.outcome} (${completed} of ${result.actions.length} actions completed)`,
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
