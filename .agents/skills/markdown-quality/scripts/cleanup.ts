#!/usr/bin/env bun
import { existsSync, realpathSync, unlinkSync } from "fs";
import { isAbsolute, relative, resolve } from "path";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: cleanup.ts <artifact-path> [--apply]\nDry-run by default; --apply deletes one artifact inside .tmp-markdown-quality/.");
    process.exit(0);
  }
  const apply = args.includes("--apply");
  const paths = args.filter((arg) => arg !== "--apply");
  if (paths.length !== 1) fail("Provide exactly one artifact path");
  const base = resolve(process.cwd(), ".tmp-markdown-quality");
  const target = resolve(paths[0]);
  if (!existsSync(target)) fail(`Artifact does not exist: ${target}`);
  const realBase = realpathSync(base);
  const realTarget = realpathSync(target);
  const rel = relative(realBase, realTarget);
  if (!rel || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) {
    fail("Refusing cleanup: target must be a file inside .tmp-markdown-quality/");
  }
  if (!apply) {
    console.log(`Dry run: would delete ${realTarget}. Pass --apply to delete.`);
    process.exit(0);
  }
  unlinkSync(realTarget);
  console.log(`Deleted ${realTarget}`);
}
