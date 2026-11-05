import type { DiscoverCandidatesOutput } from "@/scripts/commands/discover-candidates";

/** Candidate lines were already streamed by the command; this prints the closing summary. */
export function renderDiscover(output: DiscoverCandidatesOutput): void {
  console.log(
    output.write
      ? `Recorded ${output.recorded} candidate(s) with sync: false.`
      : "Read-only discovery; no entries changed.",
  );
}
