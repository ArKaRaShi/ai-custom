import type { TrackPathOutput } from "@/scripts/application/use-cases/track-path";
import type { TrackSkillOutput } from "@/scripts/application/use-cases/track-skill";

export function renderTrackPath(output: TrackPathOutput): void {
  console.log(`${output.sync ? "Tracking" : "Excluding"} ${output.rootId}:${output.pattern}`);
}

export function renderTrackSkill(output: TrackSkillOutput): void {
  console.log(`Tracked '${output.name}' under ${output.rootId} (sync: ${output.sync})`);
  if (output.retainedBackup !== undefined) {
    console.log(
      `Existing backup copy remains at ${output.retainedBackup}; no files were deleted. Preview its removal with \`prune\`.`,
    );
  }
}
