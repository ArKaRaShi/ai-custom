import { existsSync, statSync } from "fs";
import { resolve } from "path";

const MD_REGEX = /\.(md|markdown|mdx)$/i;
// Commit and PR text files. Accepted only when named as a file target, never found by directory scan.
const COMMIT_TEXT_REGEX = /(\.txt|(^|\/)COMMIT_EDITMSG)$/;
const IGNORED_DIRS: Record<string, true> = {
  ".git": true,
  node_modules: true,
  dist: true,
  build: true,
  ".vale": true,
  ".cache": true,
};

/**
 * Resolves one or more targets (file paths, directory paths, or glob patterns)
 * into a deduplicated, sorted list of existing Markdown files.
 * A file target may also be a `.txt` file or a `COMMIT_EDITMSG` file (commit and PR text).
 * Ignores other non-markdown files and excluded directory trees.
 */
export function resolveMarkdownFiles(
  targets: string | string[],
  cwd: string = process.cwd()
): string[] {
  const targetList = Array.isArray(targets) ? targets : [targets];
  const matched = new Set<string>();

  for (const rawTarget of targetList) {
    if (!rawTarget) continue;
    const targetPath = resolve(cwd, rawTarget);

    if (existsSync(targetPath)) {
      const stat = statSync(targetPath);
      if (stat.isFile()) {
        if (MD_REGEX.test(targetPath) || COMMIT_TEXT_REGEX.test(targetPath)) {
          matched.add(targetPath);
        }
      } else if (stat.isDirectory()) {
        const glob = new Bun.Glob("**/*.{md,markdown,mdx}");
        for (const file of glob.scanSync({
          cwd: targetPath,
          onlyFiles: true,
          throwErrorOnBrokenSymlink: false,
        })) {
          const parts = file.split("/");
          if (parts.some((p) => IGNORED_DIRS[p])) continue;
          matched.add(resolve(targetPath, file));
        }
      }
    } else {
      // Treat as glob pattern
      try {
        const glob = new Bun.Glob(rawTarget);
        for (const file of glob.scanSync({
          cwd,
          onlyFiles: true,
          throwErrorOnBrokenSymlink: false,
        })) {
          if (!MD_REGEX.test(file)) continue;
          const parts = file.split("/");
          if (parts.some((p) => IGNORED_DIRS[p])) continue;
          matched.add(resolve(cwd, file));
        }
      } catch {
        // invalid glob pattern, skip
      }
    }
  }

  return Array.from(matched).sort();
}
