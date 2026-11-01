import type { PathProbe } from "@/scripts/domain/manifest";
import type { Digest } from "@/scripts/domain/plan";

/** Subset of file metadata the application reads. */
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

export interface FileSystem extends PathProbe {
  /** True when the path exists (symlinks followed). */
  exists(file: string): boolean;
  /** Metadata with symlinks followed; throws when missing. */
  stat(file: string): FileStat;
  /** Metadata of the link itself; throws when missing, with the OS `code` on the error. */
  lstat(file: string): FileStat;
  /** Reads a UTF-8 text file; throws on failure. */
  readText(file: string): string;
  /** Writes UTF-8 text in place; the parent directory must exist. */
  writeText(file: string, content: string): void;
  /** Creates parent directories, writes to `<file>.<pid>.tmp`, then renames over `file`. */
  writeTextAtomic(file: string, content: string): void;
  /** Lists the direct children of a directory; throws when unreadable. */
  listDir(dir: string): DirEntry[];
  /**
   * Every file under `dir` (recursive), skipping `.DS_Store`, `node_modules`, and `.git`.
   * A missing path yields `[]`; a plain file yields `[dir]`.
   */
  getAllFiles(dir: string): string[];
  /** Creates a directory and any missing parents. */
  mkdirp(dir: string): void;
  /** Copies a file, creating missing parent directories of `dest`. */
  copyFile(src: string, dest: string): void;
  /** Removes a file. */
  unlink(file: string): void;
  /** Canonical path with symlinks resolved; throws when missing. */
  realpath(file: string): string;
  /** Target a symlink points at; throws when not a link. */
  readlink(file: string): string;
  /** Hex SHA-256 of a file's bytes, or "" when it cannot be read. */
  sha256(file: string): string;
  /**
   * Fingerprint of a location without following symlinks. A missing path is `absent`.
   * Throws a SyncError `IO_FAILED` when the path cannot be inspected or read.
   */
  digest(location: string): Digest;
}
