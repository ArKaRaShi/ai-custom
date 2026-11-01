import * as path from "node:path";
import type { Environment } from "@/scripts/application/interfaces/environment";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import {
  buildMigratedManifest,
  type LegacySkill,
  mergeLegacySkills,
  parseLegacyPathRules,
  parseLegacySkillEntries,
} from "@/scripts/domain/legacy-manifest";

export interface MigrateV2Deps {
  manifestRepository: ManifestRepository;
  fileSystem: FileSystem;
  environment: Environment;
}

export interface MigrateV2Input {
  repoBase: string;
}

export interface MigrateV2Output {
  entryCount: number;
  /** The manifest file that now holds the version 2 data. */
  manifestFile: string;
  removedLegacyCount: number;
}

export class MigrateV2 {
  constructor(private readonly deps: MigrateV2Deps) {}

  execute(input: MigrateV2Input): MigrateV2Output {
    const { manifestRepository, fileSystem, environment } = this.deps;
    const { repoBase } = input;
    const pathFile = path.join(repoBase, ".ai-sync", "manifest.json");
    const localSkillsFile = path.join(environment.skillsDir, "skills-manifest.json");
    const sharedSkillsFile = path.join(repoBase, ".agents", "skills", "skills-manifest.json");
    if (!fileSystem.exists(pathFile)) throw new Error(`Missing legacy path manifest: ${pathFile}`);
    const pathText = fileSystem.readText(pathFile);
    const rules = parseLegacyPathRules(pathText, pathFile);

    const local = this.readLegacySkills(localSkillsFile);
    const shared = this.readLegacySkills(sharedSkillsFile);
    const skills = mergeLegacySkills(local, shared);

    const manifest = buildMigratedManifest(rules, skills);

    const checked = manifestRepository.validateManifest(manifest, repoBase);
    const oldSkillFiles = [localSkillsFile, sharedSkillsFile].filter((file) =>
      fileSystem.exists(file),
    );
    const oldSkillText = new Map(oldSkillFiles.map((file) => [file, fileSystem.readText(file)]));
    manifestRepository.saveUnifiedManifest(repoBase, checked);
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

  private readLegacySkills(file: string): Map<string, LegacySkill> {
    const { fileSystem } = this.deps;
    if (!fileSystem.exists(file)) return new Map();
    let text: string;
    try {
      text = fileSystem.readText(file);
    } catch {
      throw new Error(`Cannot read legacy skill manifest: ${file}`);
    }
    return parseLegacySkillEntries(text, file);
  }
}
