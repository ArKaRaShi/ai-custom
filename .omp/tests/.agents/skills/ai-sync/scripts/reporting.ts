#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import { HOME } from "./targets";
import { SkillsManifest } from "./manifest";

/**
 * Print the "Needs your decision" table: removal/prune candidates and
 * intentional local-only skills. Called at the end of status/push/pull.
 * Report only — never deletes anything.
 */
export function printSyncSummary(manifest: SkillsManifest): void {
  const skillsDir = path.join(HOME, ".agents", "skills");
  const localSkillDirs = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  const rows: Array<[string, string, string]> = [];
  for (const n of localSkillDirs.filter((n) => !manifest.skills[n])) {
    rows.push([`skills/${n}/`, "local only", "not in manifest → remove dir or `sync.ts track`"]);
  }
  for (const n of Object.keys(manifest.skills).filter((n) => !localSkillDirs.includes(n))) {
    rows.push([`manifest: ${n}`, "manifest only", "no local files → `sync.ts prune-manifest` after review"]);
  }
  for (const [n, e] of Object.entries(manifest.skills)) {
    if (e.sync === false && e.origin === "authored" && localSkillDirs.includes(n)) {
      rows.push([`skills/${n} (sync: false)`, "local only", "intentionally local — OK"]);
    }
  }

  if (rows.length === 0) return;
  console.log(`⚠️  Needs your decision:`);
  const w = Math.max(...rows.map(([item]) => item.length));
  for (const [item, side, why] of rows) {
    console.log(`   ${item.padEnd(w)}  ${side.padEnd(13)}  ${why}`);
  }
  console.log(`   Report only — nothing is deleted without your explicit approval.\n`);
}
