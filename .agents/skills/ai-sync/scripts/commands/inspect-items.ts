import type { Io } from "@/scripts/io/io";
import { inspectItems as inspectItemsIn, inspectResultOf } from "@/scripts/lib/inspect";
import { loadLocations, loadUnifiedManifest } from "@/scripts/lib/manifest-repository";
import type { InspectItem, Result } from "@/scripts/lib/plan";
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
  result: Result;
}

/** Read-only listing of registered items with their policy, version label, and locally resolved path. */
export function inspectItems(io: Io, input: InspectItemsInput): InspectItemsOutput {
  const { repoBase, opts } = input;
  const manifest = loadUnifiedManifest(io, repoBase);
  const { items, unknown } = inspectItemsIn(
    manifest,
    loadLocations(io),
    opts.targets ?? [],
    (raw, candidate) => matchesTarget(io, raw, candidate),
  );
  if (unknown.length > 0) throw unknownTargetError(unknown);
  return { repoBase, items, result: inspectResultOf(items) };
}
