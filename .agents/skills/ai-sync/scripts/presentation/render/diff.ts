import type { ViewDiffOutput } from "@/scripts/application/use-cases/view-diff";

/** Prints what follows the streamed header line of `ViewDiff`. */
export function renderViewDiff(output: ViewDiffOutput): void {
  if (output.divergent === 0) {
    console.log(`✨ No content differences found between matching files.\n`);
    return;
  }
  for (const file of output.files) {
    console.log(`══════════════════════════════════════════════════════════════`);
    console.log(`File: ${file.relative}`);
    console.log(`Local: ${file.local}`);
    console.log(`Repo : ${file.repo}`);
    console.log(`══════════════════════════════════════════════════════════════`);
    console.log(file.diff || "(binary or identical)");
    console.log();
  }
}
