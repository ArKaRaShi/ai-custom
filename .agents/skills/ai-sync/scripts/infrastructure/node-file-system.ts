import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DirEntry, FileStat, FileSystem } from "@/scripts/application/interfaces/file-system";
import { type Digest, syncError } from "@/scripts/domain/plan";

function toFileStat(stat: fs.Stats): FileStat {
  return {
    isFile: stat.isFile(),
    isDirectory: stat.isDirectory(),
    isSymbolicLink: stat.isSymbolicLink(),
    mode: stat.mode,
  };
}

export class NodeFileSystem implements FileSystem {
  exists(file: string): boolean {
    return fs.existsSync(file);
  }

  stat(file: string): FileStat {
    return toFileStat(fs.statSync(file));
  }

  lstat(file: string): FileStat {
    return toFileStat(fs.lstatSync(file));
  }

  readText(file: string): string {
    return fs.readFileSync(file, "utf8");
  }

  writeText(file: string, content: string): void {
    fs.writeFileSync(file, content, "utf8");
  }

  writeTextAtomic(file: string, content: string): void {
    const resolved = path.resolve(file);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const temp = `${resolved}.${process.pid}.tmp`;
    fs.writeFileSync(temp, content, "utf8");
    fs.renameSync(temp, resolved);
  }

  listDir(dir: string): DirEntry[] {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  }

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
      if (entry.isDirectory()) files.push(...this.getAllFiles(full));
      else files.push(full);
    }
    return files;
  }

  mkdirp(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }

  copyFile(src: string, dest: string): void {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  unlink(file: string): void {
    fs.unlinkSync(file);
  }

  realpath(file: string): string {
    return fs.realpathSync(file);
  }

  readlink(file: string): string {
    return fs.readlinkSync(file);
  }

  nearestRealPath(value: string): string {
    let current = value;
    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(value);
      current = parent;
    }
    return path.resolve(fs.realpathSync(current), path.relative(current, value));
  }

  sha256(file: string): string {
    try {
      return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    } catch {
      return "";
    }
  }

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
  }
}
