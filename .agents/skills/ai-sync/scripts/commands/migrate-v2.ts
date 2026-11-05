import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import {
  buildMigratedManifest,
  type LegacySkill,
  mergeLegacySkills,
  parseLegacyPathRules,
  parseLegacySkillEntries,
} from "@/scripts/lib/legacy-manifest";
import { saveUnifiedManifest, validateManifest } from "@/scripts/lib/manifest-repository";

export interface MigrateV2Input {
  repoBase: string;
}

export interface MigrateV2Output {
  entryCount: number;
  /** The manifest file that now holds the version 2 data. */
  manifestFile: string;
  removedLegacyCount: number;
}

export function migrateV2(io: Io, input: MigrateV2Input): MigrateV2Output {
  const { fileSystem, environment } = io;
  const { repoBase } = input;
  const pathFile = path.join(repoBase, ".ai-sync", "manifest.json");
  const localSkillsFile = path.join(environment.skillsDir, "skills-manifest.json");
  const sharedSkillsFile = path.join(repoBase, ".agents", "skills", "skills-manifest.json");
  if (!fileSystem.exists(pathFile)) throw new Error(`Missing legacy path manifest: ${pathFile}`);
  const pathText = fileSystem.readText(pathFile);
  const rules = parseLegacyPathRules(pathText, pathFile);

  const local = readLegacySkills(io, localSkillsFile);
  const shared = readLegacySkills(io, sharedSkillsFile);
  const skills = mergeLegacySkills(local, shared);

  const manifest = buildMigratedManifest(rules, skills);

  const checked = validateManifest(io, manifest, repoBase);
  const oldSkillFiles = [localSkillsFile, sharedSkillsFile].filter((file) =>
    fileSystem.exists(file),
  );
  const oldSkillText = new Map(oldSkillFiles.map((file) => [file, fileSystem.readText(file)]));
  saveUnifiedManifest(io, repoBase, checked);
  try {
    for (const file of oldSkillFiles) fileSystem.unlink(file);
  } catch (error) {
    fileSystem.writeText(pathFile, pathText);
    for (const [file, contents] of oldSkillText) fileSystem.writeText(file, contents);
    throw error;
  }
  return {
    entryCount: manifest.entries.length,
    manifestFile: pathFile,
    removedLegacyCount: oldSkillFiles.length,
  };
}

function readLegacySkills(io: Io, file: string): Map<string, LegacySkill> {
  const { fileSystem } = io;
  if (!fileSystem.exists(file)) return new Map();
  let text: string;
  try {
    text = fileSystem.readText(file);
  } catch {
    throw new Error(`Cannot read legacy skill manifest: ${file}`);
  }
  return parseLegacySkillEntries(text, file);
}
