import * as os from "node:os";
import * as path from "node:path";
import type { Environment } from "@/scripts/application/interfaces/environment";

export class NodeEnvironment implements Environment {
  readonly home: string;
  readonly defaultRepo: string;
  readonly skillsDir: string;
  readonly locationsFile: string;
  readonly cwd: string;
  readonly isInteractive: boolean;

  constructor() {
    this.home = os.homedir();
    this.defaultRepo = process.env.AI_CUSTOM_REPO || path.join(this.home, "Disk", "ai-custom");
    this.skillsDir = process.env.AGENTS_SKILLS_DIR || path.join(this.home, ".agents", "skills");
    this.locationsFile = path.join(this.home, ".config", "ai-sync", "locations.json");
    this.cwd = process.cwd();
    this.isInteractive = !!process.stdin.isTTY;
  }
}
