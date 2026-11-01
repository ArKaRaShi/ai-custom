import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ReviewFiles } from "@/scripts/application/interfaces/review-files";

export class FsReviewFiles implements ReviewFiles {
  async readText(file: string): Promise<string> {
    return fs.readFile(file, "utf8");
  }

  async readOptionalText(file: string): Promise<string | null> {
    try {
      return await fs.readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async writeText(file: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const staging = `${file}.${process.pid}.tmp`;
    try {
      await fs.writeFile(staging, content, "utf8");
      await fs.rename(staging, file);
    } catch (error) {
      await fs.rm(staging, { force: true });
      throw error;
    }
  }
}
