import type { UntrackEntryOutput } from "@/scripts/application/use-cases/untrack-entry";
import { renderTrackPath } from "./track";

export function renderUntrack(output: UntrackEntryOutput): void {
  if (output.kind === "path") {
    renderTrackPath(output.track);
    return;
  }
  console.log(`Untracked '${output.entryPath}' from ${output.rootId}; files were not deleted.`);
}
