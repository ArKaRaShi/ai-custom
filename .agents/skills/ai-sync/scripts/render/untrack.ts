import type { UntrackEntryOutput } from "@/scripts/commands/untrack-entry";
import { renderTrackPath, renderTrackSkill } from "./track";

export function renderUntrack(output: UntrackEntryOutput): void {
  if (output.kind === "path") {
    renderTrackPath(output.track);
    return;
  }
  if (output.kind === "skill-excluded") {
    renderTrackSkill(output.track);
    console.log(
      `Run \`prune --apply --target ${output.track.rootId}:${output.track.name}\` to remove its backup copy.`,
    );
    return;
  }
  console.log(`Untracked '${output.entryPath}' from ${output.rootId}; files were not deleted.`);
}
