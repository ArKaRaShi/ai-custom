import * as path from "node:path";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import { isWithin } from "@/scripts/domain/manifest";
import { type Plan, syncError, validatePlan } from "@/scripts/domain/plan";

/** Reads and writes saved change-plan files. */
export class PlanStore {
  constructor(private readonly deps: { fileSystem: FileSystem }) {}

  /** Reads and structurally validates a plan file; throws PLAN_INVALID when unreadable or malformed. */
  readPlanFile(file: string): Plan {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.deps.fileSystem.readText(file));
    } catch (error) {
      throw syncError(
        "PLAN_INVALID",
        `Cannot read plan file ${file}: ${(error as Error).message}`,
        null,
        "Create a fresh plan with a preview and --plan-out.",
      );
    }
    return validatePlan(parsed);
  }

  /** Atomically writes a plan file, creating parent directories. */
  writePlanFile(file: string, plan: Plan): void {
    this.deps.fileSystem.writeTextAtomic(path.resolve(file), `${JSON.stringify(plan, null, 2)}\n`);
  }

  /**
   * Writes the plan to `file` and returns its resolved path. A plan file is an output artifact: it
   * must not land inside any of `guardedDirs` (the backup and managed roots), else PATH_ESCAPE.
   */
  savePlan(plan: Plan, file: string, guardedDirs: string[]): string {
    const resolved = path.resolve(file);
    const inside = guardedDirs.find((dir) => isWithin(dir, resolved));
    if (inside) {
      throw syncError(
        "PATH_ESCAPE",
        `Plan file must be outside the backup and managed roots: ${resolved}`,
        resolved,
        `Choose a path outside ${inside}.`,
      );
    }
    try {
      this.writePlanFile(resolved, plan);
    } catch (error) {
      throw syncError(
        "IO_FAILED",
        `Cannot write plan file ${resolved}: ${(error as Error).message}`,
        resolved,
      );
    }
    return resolved;
  }
}
