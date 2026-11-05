import type { Io } from "@/scripts/io/io";
import { driftFilesOf, selectDrift } from "@/scripts/lib/drift";
import { inspectItems as inspectItemsIn, inspectResultOf } from "@/scripts/lib/inspect";
import { loadLocations, loadUnifiedManifest } from "@/scripts/lib/manifest-repository";
import type { DriftFile, InspectItem, Result } from "@/scripts/lib/plan";
import { loadRoots, scanExcludedCopies, scanTargets } from "@/scripts/lib/root-scanner";
import { unknownTargetError } from "@/scripts/lib/scan";
import { matchesTarget } from "@/scripts/lib/target-matcher";
import type { SyncOptions } from "@/scripts/lib/targets";

export interface InspectItemsInput {
  repoBase: string;
  opts: SyncOptions;
}

export interface InspectItemsOutput {
  repoBase: string;
  items: InspectItem[];
  /** Drifting files and excluded backup copies in the selection, with cause and policy. Roots unbound on this machine are skipped. */
  drift: DriftFile[];
  result: Result;
}

/**
 * Read-only listing of registered items with their policy, version label, and locally resolved
 * path, plus each drifting file in the selection with its cause and the policy rule behind it.
 */
export function inspectItems(io: Io, input: InspectItemsInput): InspectItemsOutput {
  const { repoBase, opts } = input;
  const targets = opts.targets ?? [];
  const manifest = loadUnifiedManifest(io, repoBase);
  const locations = loadLocations(io);
  const { items, unknown: unknownItems } = inspectItemsIn(
    manifest,
    locations,
    targets,
    (raw, candidate) => matchesTarget(io, raw, candidate),
  );

  const loaded = loadRoots(io, repoBase, { boundOnly: true });
  const scanned = scanTargets(io, repoBase, opts, loaded);
  const pruned = scanExcludedCopies(io, repoBase, opts, loaded);
  const selection = selectDrift(io, scanned, pruned, targets);
  const unknown = unknownItems.filter((raw) => selection.unknown.includes(raw));
  if (unknown.length > 0) throw unknownTargetError(unknown);

  const drift = driftFilesOf(io, loaded.manifest, selection.entries, selection.copies);
  const result: Result = { ...inspectResultOf(items), drift };
  return { repoBase, items, drift, result };
}
