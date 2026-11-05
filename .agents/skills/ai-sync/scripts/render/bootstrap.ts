import type { BootstrapInstallsOutput } from "@/scripts/commands/bootstrap-installs";
import { printJson } from "./common";

/** JSON envelope on stdout, or the review/apply tree on stdout with errors and recovery on stderr. */
export function renderBootstrap(output: BootstrapInstallsOutput): void {
  const { result, pending, approved, manual, completed } = output;
  if (output.json) {
    printJson(result);
    return;
  }
  const approvedIds = new Set(approved);
  console.log(`ai-sync:bootstrap [${approvedIds.size === 0 ? "review" : "apply"}]`);
  for (const install of pending) {
    console.log(
      `  ├─ pending    ${install.id}@${install.hash}${approvedIds.has(install.id) ? " (approved)" : ""}`,
    );
    console.log(`  │  command    ${install.command}`);
  }
  for (const id of manual) console.log(`  ├─ manual     ${id} (no installer recorded)`);
  const first = pending[0];
  if (approvedIds.size === 0) {
    console.log(
      first
        ? `  └─ action     none; installers run only with --approve-install <root:skill>@<hash> (e.g. ${first.id}@${first.hash})`
        : `  └─ status     ✔ no installers pending`,
    );
  } else {
    console.log(
      result.errors.length === 0
        ? `  └─ status     ✔ ${completed} installer(s) completed`
        : `  └─ status     ✖ ${result.outcome} (${completed} installer(s) completed)`,
    );
  }
  for (const error of result.errors) {
    console.error(`error ${error.code}${error.item ? ` [${error.item}]` : ""}: ${error.message}`);
  }
  if (result.recovery && result.errors.length > 0) console.error(`recovery: ${result.recovery}`);
}
