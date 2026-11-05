import type { InspectItemsOutput } from "@/scripts/commands/inspect-items";
import { resolvedPathId } from "@/scripts/lib/plan";
import type { SyncOptions } from "@/scripts/lib/targets";
import { printJson } from "@/scripts/render/common";

export function renderInspect(output: InspectItemsOutput, format: SyncOptions["format"]): void {
  if (format === "json") {
    printJson(output.result);
    return;
  }
  const { items, repoBase } = output;
  console.log(`ai-sync:inspect [${items.length} item(s)]`);
  console.log(`  ├─ repo_root  ${repoBase}`);
  items.forEach((item, index) => {
    const branch = index === items.length - 1 ? "└─" : "├─";
    const label = `${item.kind} ${resolvedPathId(item.root, item.path)}`;
    console.log(
      `  ${branch} ${label}  ${item.policy}  version ${item.version ?? "unknown"}  -> ${item.local ?? "(root not bound on this machine)"}`,
    );
  });
}
