import type { ReportStatusOutput } from "@/scripts/commands/report-status";
import type { SyncOptions } from "@/scripts/lib/targets";
import { printJson } from "@/scripts/render/common";

export function renderStatus(output: ReportStatusOutput, format: SyncOptions["format"]): void {
  if (format === "json") {
    printJson(output.result);
    return;
  }
  const { counts } = output;
  console.log(`ai-sync:status [${counts.in_sync} files in sync]`);
  console.log(`  ├─ machine_home ${output.home}`);
  console.log(`  ├─ repo_root    ${output.repoBase}`);
  console.log(
    `  ├─ roots        ${output.roots.map((root) => `${root.id} -> ${root.local}`).join(" · ")}`,
  );
  if (output.targets.length > 0) console.log(`  ├─ scope        ${output.targets.join(", ")}`);
  console.log(`  ├─ in_sync      ${counts.in_sync} files`);
  console.log(`  ├─ new_local    ${counts.new_local} files`);
  console.log(`  ├─ new_repo     ${counts.new_repo} files`);
  console.log(`  ├─ modified     ${counts.modified} files`);
  console.log(
    output.drifting
      ? `  └─ status       ⚠ drift detected (run push or pull)`
      : `  └─ status       ✔ in sync`,
  );
}
