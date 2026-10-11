import * as fs from "fs";
import * as path from "path";

export function detectPreferredInstallCommand(skillDir: string): string {
  if (fs.existsSync(path.join(skillDir, "bun.lock")) || typeof (globalThis as Record<string, unknown>).Bun !== "undefined") {
    return "bun install";
  }
  if (fs.existsSync(path.join(skillDir, "pnpm-lock.yaml"))) {
    return "pnpm install";
  }
  if (fs.existsSync(path.join(skillDir, "yarn.lock"))) {
    return "yarn install";
  }
  if (fs.existsSync(path.join(skillDir, "uv.lock"))) {
    return "uv sync";
  }
  if (fs.existsSync(path.join(skillDir, "poetry.lock"))) {
    return "poetry install";
  }
  if (fs.existsSync(path.join(skillDir, "requirements.txt"))) {
    return "uv pip install -r requirements.txt || pip install -r requirements.txt";
  }
  return "npm install";
}

export function formatMissingDependencyDiagnostic(packageName: string, skillDir: string): string {
  const command = detectPreferredInstallCommand(skillDir);
  return [
    `✖ Missing required dependency '${packageName}'.`,
    `  To install dependencies for this skill:`,
    `  cd ${skillDir} && ${command}`,
  ].join("\n");
}

if (import.meta.main) {
  const skillDirectory = path.resolve(import.meta.dir, "..");
  const sample = formatMissingDependencyDiagnostic("sample-package", skillDirectory);
  console.log(sample);
}
