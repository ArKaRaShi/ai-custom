import type { ResolveConflictsOutput } from "@/scripts/application/use-cases/resolve-conflicts";

/** Prints what follows the lines `ResolveConflicts` streams while it runs. */
export function renderResolve(output: ResolveConflictsOutput): void {
  if (output.divergent === 0) {
    console.log(`✨ No content differences found between matching files.\n`);
    return;
  }
  console.log(`\n🎉 Resolve finished: ${output.resolved} file(s) updated.\n`);
}
