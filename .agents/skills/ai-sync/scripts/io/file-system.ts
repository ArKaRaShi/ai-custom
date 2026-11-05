import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type Digest, syncError } from "@/scripts/lib/plan";

/** Subset of file metadata the scripts read. */
export interface FileStat {
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  /** Permission bits as reported by the OS (`st_mode`). */
  mode: number;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

function toFileStat(stat: fs.Stats): FileStat {
  return {
    isFile: stat.isFile(),
    isDirectory: stat.isDirectory(),
    isSymbolicLink: stat.isSymbolicLink(),
    mode: stat.mode,
  };
}

/** Real file-system access; `io.fileSystem`. */
export const fileSystem = {
  /** True when the path exists (symlinks followed). */
  exists(file: string): boolean {
    return fs.existsSync(file);
  },

  /** Metadata with symlinks followed; throws when missing. */
  stat(file: string): FileStat {
    return toFileStat(fs.statSync(file));
  },

  /** Metadata of the link itself; throws when missing, with the OS `code` on the error. */
  lstat(file: string): FileStat {
    return toFileStat(fs.lstatSync(file));
  },

  /** Reads a UTF-8 text file; throws on failure. */
  readText(file: string): string {
    return fs.readFileSync(file, "utf8");
  },

  /** Writes UTF-8 text in place; the parent directory must exist. */
  writeText(file: string, content: string): void {
    fs.writeFileSync(file, content, "utf8");
  },

  /** Creates parent directories, writes to `<file>.<pid>.tmp`, then renames over `file`. */
  writeTextAtomic(file: string, content: string): void {
    const resolved = path.resolve(file);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const temp = `${resolved}.${process.pid}.tmp`;
    fs.writeFileSync(temp, content, "utf8");
    fs.renameSync(temp, resolved);
  },

  /** Lists the direct children of a directory; throws when unreadable. */
  listDir(dir: string): DirEntry[] {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  },

  /**
   * Every file under `dir` (recursive), skipping `.DS_Store`, `node_modules`, and `.git`.
   * A missing path yields `[]`; a plain file yields `[dir]`.
   */
  getAllFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return [dir];
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store" || entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...fileSystem.getAllFiles(full));
      else files.push(full);
    }
    return files;
  },

  /** Creates a directory and any missing parents. */
  mkdirp(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  },

  /** Copies a file, creating missing parent directories of `dest`. */
  copyFile(src: string, dest: string): void {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  },

  /** Removes a file. */
  unlink(file: string): void {
    fs.unlinkSync(file);
  },

  /** Removes a directory only when it is empty; returns whether it was removed. */
  removeDirIfEmpty(dir: string): boolean {
    try {
      fs.rmdirSync(dir);
      return true;
    } catch {
      return false;
    }
  },

  /** Canonical path with symlinks resolved; throws when missing. */
  realpath(file: string): string {
    return fs.realpathSync(file);
  },

  /** Target a symlink points at; throws when not a link. */
  readlink(file: string): string {
    return fs.readlinkSync(file);
  },

  /** Canonical form of `value` through its nearest existing ancestor; `value` need not exist. */
  nearestRealPath(value: string): string {
    let current = value;
    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(value);
      current = parent;
    }
    return path.resolve(fs.realpathSync(current), path.relative(current, value));
  },

  /** Hex SHA-256 of a file's bytes, or "" when it cannot be read. */
  sha256(file: string): string {
    try {
      return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    } catch {
      return "";
    }
  },

  /**
   * Fingerprint of a location without following symlinks. A missing path is `absent`.
   * Throws a SyncError `IO_FAILED` when the path cannot be inspected or read.
   */
  digest(location: string): Digest {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(location);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return { kind: "absent" };
      throw syncError(
        "IO_FAILED",
        `Cannot inspect ${location}: ${(error as Error).message}`,
        location,
      );
    }
    if (stat.isSymbolicLink()) return { kind: "symlink", target: fs.readlinkSync(location) };
    if (stat.isDirectory()) return { kind: "dir" };
    if (!stat.isFile()) {
      throw syncError("IO_FAILED", `Unsupported file type: ${location}`, location);
    }
    try {
      return {
        kind: "file",
        sha256: createHash("sha256").update(fs.readFileSync(location)).digest("hex"),
        mode: stat.mode & 0o777,
      };
    } catch (error) {
      throw syncError(
        "IO_FAILED",
        `Cannot read ${location}: ${(error as Error).message}`,
        location,
      );
    }
  },
};

export type FileSystem = typeof fileSystem;
