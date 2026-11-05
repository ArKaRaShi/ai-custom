import type { RetireSkillOutput } from "@/scripts/commands/retire-skill";
import { manifestDiffNotes } from "@/scripts/lib/manifest-diff";
import type { SyncOptions } from "@/scripts/lib/targets";
import { printErrors, printJson } from "./common";

/** Prints a retire outcome: the JSON envelope for `--format=json`, the tree otherwise. */
export function renderRetire(output: RetireSkillOutput, format: SyncOptions["format"]): void {
  const { phase, result, extraLines } = output;
  if (format === "json") {
    printJson(result);
    return;
  }
  console.log(`ai-sync:retire [${phase}]`);
  console.log(`  ├─ to_remove  ${result.scope.resolvedPaths.length} file(s)`);
  result.scope.resolvedPaths.forEach((file, index) => {
    const state = result.actions[index]?.state;
    const mark = state === "completed" ? "✔ removed: " : state === "not_attempted" ? "· " : "";
    console.log(`  │  ├─ ${mark}${file}`);
  });
  if (result.git) {
    console.log(
      `  ├─ git_export ${result.git.exportedPaths?.length ?? 0} path(s) plus the manifest`,
    );
    for (const file of result.git.unrelatedChanges ?? []) console.log(`  │  ✖ unrelated: ${file}`);
    for (const note of manifestDiffNotes(result.git.manifestDiff)) console.log(`  │  ${note}`);
  }
  for (const line of extraLines) console.log(`  ├─ ${line}`);
  if (result.outcome === "preview") {
    console.log("  └─ action     none (preview only; run with --apply to retire)");
  } else if (result.outcome === "success") {
    console.log("  └─ status     ✔ retire complete");
  } else {
    console.log(`  └─ status     ✖ ${result.outcome}`);
  }
  printErrors(result);
}
