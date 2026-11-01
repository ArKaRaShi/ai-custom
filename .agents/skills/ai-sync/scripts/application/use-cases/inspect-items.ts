import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import type { TargetMatcher } from "@/scripts/application/services/target-matcher";
import { inspectItems, inspectResultOf } from "@/scripts/domain/inspect";
import type { InspectItem, Result } from "@/scripts/domain/plan";
import { unknownTargetError } from "@/scripts/domain/scan";
import type { SyncOptions } from "@/scripts/domain/targets";

export interface InspectItemsDeps {
  manifestRepository: ManifestRepository;
  targetMatcher: TargetMatcher;
}

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
export class InspectItems {
  constructor(private readonly deps: InspectItemsDeps) {}

  execute(input: InspectItemsInput): InspectItemsOutput {
    const { manifestRepository, targetMatcher } = this.deps;
    const { repoBase, opts } = input;
    const manifest = manifestRepository.loadUnifiedManifest(repoBase);
    const { items, unknown } = inspectItems(
      manifest,
      manifestRepository.loadLocations(),
      opts.targets ?? [],
      (raw, candidate) => targetMatcher.matchesTarget(raw, candidate),
    );
    if (unknown.length > 0) throw unknownTargetError(unknown);
    return { repoBase, items, result: inspectResultOf(items) };
  }
}
