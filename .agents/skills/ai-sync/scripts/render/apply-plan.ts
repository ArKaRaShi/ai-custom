import type { ApplySavedPlanOutput } from "@/scripts/commands/apply-saved-plan";
import type { SyncOptions } from "@/scripts/lib/targets";
import { printErrors, printJson } from "./common";
import { printApplyTree, printGitStopped, printPreviewTree } from "./transfer";

/** Prints the outcome of rechecking or applying a saved plan: JSON for `--format=json`, the tree otherwise. */
export function renderApplyPlan(output: ApplySavedPlanOutput, format: SyncOptions["format"]): void {
  const { plan, result } = output;
  if (format === "json") {
    printJson(result);
    return;
  }
  switch (output.kind) {
    case "rejected":
      console.log(`ai-sync:apply [rejected]`);
      console.log(`  └─ status     ✖ plan is stale; no files changed`);
      printErrors(result);
      return;
    case "git-stopped":
      printGitStopped(plan, result, output.phase);
      return;
    case "preview":
      printPreviewTree(plan, undefined, output.notes);
      return;
    case "applied":
      printApplyTree(plan, result, output.extraLines);
      return;
  }
}
