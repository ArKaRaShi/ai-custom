import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import { isWithin } from "@/scripts/lib/manifest";
import { type Plan, syncError, validatePlan } from "@/scripts/lib/plan";

/** Reads and structurally validates a plan file; throws PLAN_INVALID when unreadable or malformed. */
export function readPlanFile(io: Io, file: string): Plan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(io.fileSystem.readText(file));
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
export function writePlanFile(io: Io, file: string, plan: Plan): void {
  io.fileSystem.writeTextAtomic(path.resolve(file), `${JSON.stringify(plan, null, 2)}\n`);
}

/**
 * Writes the plan to `file` and returns its resolved path. A plan file is an output artifact: it
 * must not land inside any of `guardedDirs` (the backup and managed roots), else PATH_ESCAPE.
 */
export function savePlan(io: Io, plan: Plan, file: string, guardedDirs: string[]): string {
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
    writePlanFile(io, resolved, plan);
  } catch (error) {
    throw syncError(
      "IO_FAILED",
      `Cannot write plan file ${resolved}: ${(error as Error).message}`,
      resolved,
    );
  }
  return resolved;
}
