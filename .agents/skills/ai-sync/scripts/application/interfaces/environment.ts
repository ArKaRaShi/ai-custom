/** Process-level facts the application needs, resolved once by the composition root. */
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
