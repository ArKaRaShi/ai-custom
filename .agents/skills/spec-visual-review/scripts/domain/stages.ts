import { createHash } from "node:crypto";

export type StageKind = "spec" | "markdown";

/** One reviewed artifact. Earlier stages stay in the manifest, so the page keeps showing them. */
export interface StageEntry {
  id: string;
  label: string;
  kind: StageKind;
  /** Path relative to the manifest folder. */
  source: string;
  /** Date the user approved this stage. Set only after the user says so. */
  approved?: string;
  /** SHA-256 of the source at approval. The tool pins it the first time it renders an approved stage. */
  approvedSha256?: string;
}

export interface StageManifest {
  title: string;
  stages: StageEntry[];
}

export type StageState = "approved" | "changed" | "draft" | "missing";

export interface StageStatus {
  id: string;
  label: string;
  state: StageState;
  notes: string[];
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function stateOf(entry: StageEntry, sha: string | null | undefined): StageState {
  if (sha === null || sha === undefined) return "missing";
  if (entry.approved === undefined) return "draft";
  if (entry.approvedSha256 === undefined || entry.approvedSha256 === sha) return "approved";
  return "changed";
}

/** Compares each source's current hash with the hash pinned at approval. A missing source maps to `null`. */
export function stageStates(
  entries: readonly StageEntry[],
  shaBySource: ReadonlyMap<string, string | null>,
): StageStatus[] {
  const changedBefore: string[] = [];
  return entries.map((entry) => {
    const state = stateOf(entry, shaBySource.get(entry.source));
    const notes: string[] = [];
    if (state === "changed") {
      notes.push(`Source changed after approval on ${entry.approved}. Review this stage again.`);
    }
    if (state === "missing") notes.push("Not created yet.");
    for (const label of changedBefore) {
      notes.push(`${label} changed after approval. This stage may be out of date.`);
    }
    if (state === "changed") changedBefore.push(entry.label);
    return { id: entry.id, label: entry.label, state, notes };
  });
}
