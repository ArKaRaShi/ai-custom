import * as os from "node:os";
import * as path from "node:path";

/** Process-level facts the scripts need, resolved once when `io` is created. */
export interface Environment {
  /** The user's home directory. */
  readonly home: string;
  /** Default backup repository (`AI_CUSTOM_REPO` or `~/Disk/ai-custom`). */
  readonly defaultRepo: string;
  /** Installed skills directory (`AGENTS_SKILLS_DIR` or `~/.agents/skills`). */
  readonly skillsDir: string;
  /** Machine-local root bindings file (`~/.config/ai-sync/locations.json`). */
  readonly locationsFile: string;
  /** Current working directory. */
  readonly cwd: string;
  /** True when stdin is an interactive terminal. */
  readonly isInteractive: boolean;
}

export function createEnvironment(): Environment {
  const home = os.homedir();
  return {
    home,
    defaultRepo: process.env.AI_CUSTOM_REPO || path.join(home, "Disk", "ai-custom"),
    skillsDir: process.env.AGENTS_SKILLS_DIR || path.join(home, ".agents", "skills"),
    locationsFile: path.join(home, ".config", "ai-sync", "locations.json"),
    cwd: process.cwd(),
    isInteractive: !!process.stdin.isTTY,
  };
}
