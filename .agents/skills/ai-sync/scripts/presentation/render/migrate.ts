import type { MigrateV2Output } from "@/scripts/application/use-cases/migrate-v2";

export function renderMigrate(output: MigrateV2Output): void {
  console.log(
    `Converted ${output.entryCount} entries into ${output.manifestFile}; removed ${output.removedLegacyCount} legacy skill manifest(s).`,
  );
}
