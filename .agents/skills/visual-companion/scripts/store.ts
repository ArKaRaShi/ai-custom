import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, truncate, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { type ChoiceEvent, detectMode, type Mode, type Screen } from "./domain";

export interface PushOptions {
  title?: string;
  mode?: Mode;
  isolated?: boolean;
}

export interface PublishedScreen {
  screen: Screen;
  content: string;
}

/** Owns the on-disk session: screens, the current pointer, and the event ledger. */
export class SessionStore {
  constructor(readonly root: string) {}

  get screensDir(): string {
    return join(this.root, "content");
  }
  get stateDir(): string {
    return join(this.root, "state");
  }
  get filesDir(): string {
    return join(this.root, "files");
  }
  get currentPath(): string {
    return join(this.stateDir, "current.json");
  }
  get eventsPath(): string {
    return join(this.stateDir, "events.jsonl");
  }

  async init(): Promise<void> {
    for (const dir of [this.screensDir, this.stateDir, this.filesDir]) {
      await mkdir(dir, { recursive: true });
    }
  }

  /** Publishing a screen clears the ledger, so events only describe what is shown now. */
  async push(html: string, options: PushOptions = {}): Promise<Screen> {
    await this.init();
    const screenId = await this.nextScreenId();
    const screen: Screen = {
      screenId,
      file: `${String(screenId).padStart(3, "0")}-screen.html`,
      title: options.title ?? `Screen ${screenId}`,
      mode: options.mode ?? detectMode(html),
      pushedAt: Date.now(),
      ...(options.isolated ? { isolated: true } : {}),
    };
    await writeFile(join(this.screensDir, screen.file), html, "utf8");
    const pointer = join(this.stateDir, `current-${randomUUID()}.tmp`);
    await writeFile(pointer, `${JSON.stringify(screen, null, 2)}\n`, "utf8");
    await rename(pointer, this.currentPath);
    await writeFile(this.eventsPath, "", "utf8");
    return screen;
  }

  async nextScreenId(): Promise<number> {
    if (!existsSync(this.screensDir)) return 1;
    let highest = 0;
    for (const name of await readdir(this.screensDir)) {
      const match = /^(\d+)-/.exec(name);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
    return highest + 1;
  }

  /** The screen to serve, or null when nothing was pushed or the file vanished. */
  async current(): Promise<PublishedScreen | null> {
    let screen: Screen;
    try {
      screen = JSON.parse(await readFile(this.currentPath, "utf8")) as Screen;
    } catch {
      return null;
    }
    try {
      const content = await readFile(join(this.screensDir, basename(screen.file)), "utf8");
      return { screen, content };
    } catch {
      return null;
    }
  }

  async appendEvent(event: ChoiceEvent): Promise<void> {
    await this.init();
    await writeFile(this.eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" });
  }

  async readEvents(): Promise<ChoiceEvent[]> {
    try {
      const raw = await readFile(this.eventsPath, "utf8");
      return parseLines(raw);
    } catch {
      return [];
    }
  }

  async eventsSize(): Promise<number> {
    try {
      return (await stat(this.eventsPath)).size;
    } catch {
      return 0;
    }
  }

  /** Events appended after a byte offset; `events --wait` uses this. */
  async eventsSince(offset: number): Promise<ChoiceEvent[]> {
    if ((await this.eventsSize()) <= offset) return [];
    try {
      const bytes = await readFile(this.eventsPath);
      const raw = bytes.subarray(offset).toString("utf8");
      return parseLines(raw);
    } catch {
      return [];
    }
  }

  async clearEvents(): Promise<void> {
    if (!existsSync(this.eventsPath)) return;
    await truncate(this.eventsPath, 0);
  }
}

function parseLines(raw: string): ChoiceEvent[] {
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ChoiceEvent];
      } catch {
        return [];
      }
    });
}

/** Resolve the active project session without migrating or deleting older data. */
export function resolveRunDir(cwd: string, projectDir?: string): string {
  if (projectDir) {
    const root = resolve(cwd, projectDir, ".visual-companion");
    mkdirSync(root, { recursive: true });
    const active = join(root, "active-session");
    const temporary = join(root, `active-${randomUUID()}.tmp`);
    writeFileSync(temporary, `${randomUUID()}\n`, { flag: "wx", mode: 0o600 });
    try {
      try { linkSync(temporary, active); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    } finally {
      unlinkSync(temporary);
    }
    const id = readFileSync(active, "utf8").trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("invalid active session ID");
    return join(root, "sessions", id);
  }
  if (process.env.VISUAL_COMPANION_DIR) return resolve(cwd, process.env.VISUAL_COMPANION_DIR);
  const slug = cwd.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-48);
  return resolve(cwd, process.env.TMPDIR || "/tmp", `visual-companion-${slug || "session"}`);
}
