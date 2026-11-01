import type { DiscoverCandidatesOutput } from "@/scripts/application/use-cases/discover-candidates";

/** Candidate lines were already streamed by the use case; this prints the closing summary. */
export function renderDiscover(output: DiscoverCandidatesOutput): void {
  console.log(
    output.write
      ? `Recorded ${output.recorded} candidate(s) with sync: false.`
      : "Read-only discovery; no entries changed.",
  );
}
