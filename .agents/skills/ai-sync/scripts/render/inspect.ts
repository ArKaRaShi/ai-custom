import type { InspectItemsOutput } from "@/scripts/commands/inspect-items";
import { describeRule } from "@/scripts/lib/drift";
import { resolvedPathId } from "@/scripts/lib/plan";
import type { SyncOptions } from "@/scripts/lib/targets";
import { printJson } from "@/scripts/render/common";

export function renderInspect(output: InspectItemsOutput, format: SyncOptions["format"]): void {
  if (format === "json") {
    printJson(output.result);
    return;
  }
  const { items, drift, repoBase } = output;
  console.log(`ai-sync:inspect [${items.length} item(s)]`);
  console.log(`  ├─ repo_root  ${repoBase}`);
  items.forEach((item, index) => {
    const last = index === items.length - 1 && drift.length === 0;
    const label = `${item.kind} ${resolvedPathId(item.root, item.path)}`;
    console.log(
      `  ${last ? "└─" : "├─"} ${label}  ${item.policy}  version ${item.version ?? "unknown"}  -> ${item.local ?? "(root not bound on this machine)"}`,
    );
  });
  if (drift.length === 0) return;
  console.log(`  └─ drift      ${drift.length} file(s)`);
  drift.forEach((file, index) => {
    const branch = index === drift.length - 1 ? "└─" : "├─";
    const trunk = index === drift.length - 1 ? " " : "│";
    console.log(`     ${branch} ${file.id}  ${file.cause.code}: ${file.cause.message}`);
    console.log(
      `     ${trunk}    policy: ${file.policy.verdict} by ${describeRule(file.policy.rule)}`,
    );
  });
}
