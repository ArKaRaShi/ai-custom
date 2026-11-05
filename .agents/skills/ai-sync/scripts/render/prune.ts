import type { PruneBackupOutput } from "@/scripts/commands/prune-backup";
import { describeRule } from "@/scripts/lib/drift";
import type { SyncOptions } from "@/scripts/lib/targets";
import { printJson } from "./common";
import { printApplyTree, printPreviewTree } from "./transfer";

/** Prints a prune outcome: the JSON envelope for `--format=json`, the tree otherwise. */
export function renderPrune(output: PruneBackupOutput, format: SyncOptions["format"]): void {
  const { plan, result } = output;
  if (format === "json") {
    printJson(result);
    return;
  }
  const reasons = result.actions.map((action) =>
    action.excludedBy ? `excluded by ${describeRule(action.excludedBy)}` : undefined,
  );
  if (output.kind === "applied") {
    printApplyTree(plan, result, [], reasons);
    return;
  }
  if (plan.actions.length === 0) {
    console.log("ai-sync:prune [preview]");
    console.log(`  ├─ repo_root  ${plan.repository.path}`);
    console.log("  ├─ to_remove  0 file(s)");
    console.log("  └─ status     ✔ nothing to remove (no excluded backup copies)");
  } else printPreviewTree(plan, output.planFile, [], reasons);
}
