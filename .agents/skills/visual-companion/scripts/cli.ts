#!/usr/bin/env bun
import { appendFile, chmod, lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { composePage, escapeHtml, renderScreen } from "./render";
import { cookieName, createKey } from "./auth";
import { detectMode, type Mode } from "./domain";
import {
  clearRunInfo,
  isAlive,
  openBrowser,
  readStatus,
  type RunInfo,
  startDetached,
  stopServer,
  writeRunInfo,
} from "./runner";
import { startServer, type RunningServer } from "./server";
import { resolveRunDir, SessionStore } from "./store";

const CLI = import.meta.filename;
const USAGE = `visual-companion — show mockups and choices in a local browser tab

  start   [--port <n>] [--host <host>] [--open]
          [--idle-minutes <n>]                 start (or reuse) the companion
  status                                    report running / stale / stopped
  stop                                      stop it
  push <file> [--title <text>] [--plain|--bundle] [--isolate]
                                            publish a screen and reload the tab
  page <name> <file> [<name> <file> ...] [--title <text>]
                                            stack fragments into one long page with a section index
  compare <name> <file> <name> <file> [...] publish static isolated previews side-by-side
  states <name> <file> [<name> <file> ...]  publish full-page isolated states with an edge rail
  stage <file> <relative-path>              copy one dependency to session/files
  events  [--wait <seconds>] [--clear]      read (or wait for) recorded choices
  components [--json]                       list the component catalogue

  Staging does not rewrite CSS URLs: stage dependencies and use paths resolving under /files/.

  session: every command above except components takes --project-dir <dir> or --run-dir <dir>
  flags: --json (structured output)
  exit: 0 ok, 1 failure, 2 usage`;

const VALUE_FLAGS = new Set([
  "project-dir",
  "port",
  "host",
  "idle-minutes",
  "title",
  "wait",
  "run-dir",
  "log",
  "owner-pid",
  "format",
]);
const BOOLEAN_FLAGS = new Set(["open", "json", "plain", "bundle", "clear", "help", "isolate"]);

interface Args {
  command: string;
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const [rawName, inline] = token.slice(2).split("=", 2);
    const name = rawName ?? "";
    if (inline !== undefined) {
      flags.set(name, inline);
    } else if (VALUE_FLAGS.has(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`--${name} needs a value`);
      flags.set(name, value);
      i += 1;
    } else if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, true);
    } else {
      throw new UsageError(`unknown flag --${name}`);
    }
  }
  return { command: positional[0] ?? "help", positional: positional.slice(1), flags };
}

class UsageError extends Error {}

function json(flags: Map<string, string | true>): boolean {
  return flags.has("json") || flags.get("format") === "json";
}

function numberFlag(flags: Map<string, string | true>, name: string): number | undefined {
  const raw = flags.get(name);
  if (typeof raw !== "string") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new UsageError(`--${name} must be a number`);
  return value;
}

function emit(value: unknown, structured: boolean, lines: string[]): void {
  process.stdout.write(structured ? `${JSON.stringify(value, null, 2)}\n` : `${lines.join("\n")}\n`);
}

function runContext(flags: Map<string, string | true>) {
  const projectDir = flags.get("project-dir");
  const runDirFlag = flags.get("run-dir");
  const runDir =
    typeof runDirFlag === "string"
      ? resolve(runDirFlag)
      : resolveRunDir(process.cwd(), typeof projectDir === "string" ? projectDir : undefined);
  return { runDir, store: new SessionStore(runDir) };
}

async function serve(flags: Map<string, string | true>): Promise<void> {
  const runDirFlag = flags.get("run-dir");
  if (typeof runDirFlag !== "string") throw new UsageError("serve needs --run-dir");
  const runDir = resolve(runDirFlag);
  const store = new SessionStore(runDir);
  await store.init();

  const keyPath = join(store.stateDir, "key");
  let key: string;
  try {
    await chmod(keyPath, 0o600);
    key = (await readFile(keyPath, "utf8")).trim();
  } catch {
    key = createKey();
    await writeFile(keyPath, `${key}\n`, { mode: 0o600 });
  }

  const port = numberFlag(flags, "port");
  const host = flags.get("host");
  const idleMinutes = numberFlag(flags, "idle-minutes") ?? 240;
  const ownerPid = numberFlag(flags, "owner-pid") ?? null;

  // Reuse the previous port so an open browser tab reconnects to the same URL
  // after a restart; fall back to any free port if it is taken.
  const portPath = join(store.stateDir, "port");
  const savedPort = Number((await readFile(portPath, "utf8").catch(() => "0")).trim());
  const previousPort = port ?? (Number.isFinite(savedPort) ? savedPort : 0);

  const boot = (bindPort: number) =>
    startServer({ store, key, port: bindPort, host: typeof host === "string" ? host : undefined });

  let server: RunningServer;
  try {
    server = boot(previousPort);
  } catch {
    server = boot(0);
  }
  await writeFile(portPath, `${server.port}\n`, { mode: 0o600 });

  const info: RunInfo = {
    pid: process.pid,
    port: server.port,
    url: server.url,
    key,
    runDir,
    startedAt: Date.now(),
  };
  await writeRunInfo(runDir, info);
  process.stdout.write(`${JSON.stringify({ type: "server-started", pid: info.pid, port: info.port, runDir: info.runDir, startedAt: info.startedAt })}\n`);

  let closing = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (closing) return;
    closing = true;
    clearInterval(watchdog);
    process.stdout.write(`${JSON.stringify({ type: "server-stopped", reason })}\n`);
    await server.stop();
    await clearRunInfo(runDir);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("sigterm"));
  process.on("SIGINT", () => void shutdown("sigint"));

  const watchdog = setInterval(() => {
    if (server.idleFor() > idleMinutes * 60_000) void shutdown("idle");
    else if (ownerPid && !isAlive(ownerPid)) void shutdown("owner-exited");
  }, 30_000);
  watchdog.unref();
}

async function start(flags: Map<string, string | true>): Promise<void> {
  const projectDir = flags.get("project-dir");
  if (typeof projectDir === "string") {
    const root = join(projectDir, ".visual-companion");
    await mkdir(root, { recursive: true });
    const ignorePath = join(root, ".gitignore");
    const existing = await readFile(ignorePath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (!/(?:^|\n)\*\r?\n?$/.test(existing)) {
      await appendFile(ignorePath, `${existing && !existing.endsWith("\n") ? "\n" : ""}*\n`);
    }
    for (const name of ["previews", "styles"]) {
      await mkdir(join(projectDir, ".visual-companion", name), { recursive: true });
    }
  }
  const { runDir, store } = runContext(flags);
  const status = await readStatus(runDir);
  if (status.state === "running") {
    if (flags.has("open")) openBrowser(status.info.url);
    emit(status.info, json(flags), [status.info.url, "already running"]);
    return;
  }

  await mkdir(store.stateDir, { recursive: true });
  const logPath = join(store.stateDir, "server.log");
  const info = await startDetached({
    runDir,
    cliPath: CLI,
    port: numberFlag(flags, "port"),
    host: typeof flags.get("host") === "string" ? (flags.get("host") as string) : undefined,
    idleMinutes: numberFlag(flags, "idle-minutes"),
    ownerPid: numberFlag(flags, "owner-pid") ?? null,
    logPath,
  });
  if (flags.has("open")) openBrowser(info.url);
  emit(info, json(flags), [info.url, `run dir: ${runDir}`, `log: ${logPath}`]);
}

async function status(flags: Map<string, string | true>): Promise<void> {
  const { runDir } = runContext(flags);
  const current = await readStatus(runDir);
  emit(
    { runDir, ...current },
    json(flags),
    current.state === "running"
      ? [`running on ${current.info.url}`, `run dir: ${runDir}`]
      : current.state === "stale"
        ? ["stale run file (server is gone); `start` replaces it", `run dir: ${runDir}`]
        : ["stopped", `run dir: ${runDir}`],
  );
}

async function stop(flags: Map<string, string | true>): Promise<void> {
  const { runDir } = runContext(flags);
  const current = await readStatus(runDir);
  const killed = current.state === "stopped" ? false : await stopServer(current.info);
  const projectDir = flags.get("project-dir");
  if (typeof projectDir === "string" && !flags.has("run-dir")) {
    const active = resolve(projectDir, ".visual-companion", "active-session");
    if ((await readFile(active, "utf8").catch(() => "")).trim() === runDir.split(/[\\/]/).pop()) {
      await unlink(active).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  emit({ stopped: killed }, json(flags), [killed ? "stopped" : current.state === "stopped" ? "nothing to stop" : "was not running"]);
}

async function push(args: Args): Promise<void> {
  const file = args.positional[0];
  if (!file) throw new UsageError("push needs a file");
  let html: string;
  try {
    html = await readFile(file, "utf8");
  } catch {
    throw new Error(`cannot read ${file}`);
  }
  if (html.trim().length === 0) throw new Error(`${file} is empty`);

  await publish(args, html);
}

async function publish(args: Args, html: string): Promise<void> {
  const { runDir, store } = runContext(args.flags);
  const forced: Mode | undefined = args.flags.has("plain")
    ? "plain"
    : args.flags.has("bundle")
      ? "bundle"
      : undefined;
  const title = args.flags.get("title");
  const screen = await store.push(html, {
    mode: forced,
    title: typeof title === "string" ? title : undefined,
    isolated: args.flags.has("isolate"),
  });

  const current = await readStatus(runDir);
  let reloaded = false;
  if (current.state === "running") {
    const response = await fetch(`${current.info.url.replace(/\?.*$/, "")}internal/reload`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${cookieName(current.info.key)}=${current.info.key}` },
      body: JSON.stringify({ screenId: screen.screenId }),
    }).catch(() => null);
    const body = response?.ok ? ((await response.json().catch(() => null)) as { clients?: number } | null) : null;
    reloaded = (body?.clients ?? 0) > 0;
  }

  emit(
    { ...screen, reloaded },
    json(args.flags),
    [
      `screen ${screen.screenId} (${screen.mode}) — ${screen.title}`,
      current.state === "running" ? (reloaded ? `browser notified: ${current.info.url}` : "browser is not connected") : "no server running; start it to view",
    ],
  );
}

async function compare(args: Args): Promise<void> {
  if (args.positional.length < 4 || args.positional.length % 2 !== 0) {
    throw new UsageError("compare needs at least two name and file pairs");
  }
  if (args.flags.has("isolate") || args.flags.has("plain") || args.flags.has("bundle")) {
    throw new UsageError("compare does not accept --isolate, --plain or --bundle");
  }
  const previews = await readPairs(args.positional, "preview");
  const { store } = runContext(args.flags);
  await store.init();
  if (!(await lstat(store.filesDir)).isDirectory()) throw new Error("session files must be a directory, not a symlink");
  const directory = `compare-${randomUUID()}`;
  await mkdir(join(store.filesDir, directory));
  for (let i = 0; i < previews.length; i++) {
    const preview = await isolatedPreview(previews[i]!);
    await writeFile(join(store.filesDir, directory, `${i}.html`), preview, { flag: "wx" });
  }
  const cards = previews.map((preview, i) => `<section><h2>${escapeHtml(preview.name)}</h2><iframe title="${escapeHtml(preview.name)}" sandbox="allow-same-origin" src="/files/${directory}/${i}.html"></iframe></section>`).join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comparison</title><style>body{margin:0;padding:1rem;font:16px system-ui;background:#f1f2f4}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,32rem),1fr));gap:1rem}section{min-width:0}h2{font-size:1rem}iframe{display:block;width:100%;height:75vh;min-height:24rem;border:1px solid #ccc;background:white;box-sizing:border-box}</style></head><body><main>${cards}</main></body></html>`;
  await publish(args, html);
}

async function states(args: Args): Promise<void> {
  if (args.positional.length < 2 || args.positional.length % 2 !== 0) {
    throw new UsageError("states needs one or more name and file pairs");
  }
  if (["isolate", "plain", "bundle"].some((flag) => args.flags.has(flag))) {
    throw new UsageError("states does not accept --isolate, --plain or --bundle");
  }
  const previews = await readPairs(args.positional, "state");
  const { store } = runContext(args.flags);
  await store.init();
  if (!(await lstat(store.filesDir)).isDirectory()) throw new Error("session files must be a directory, not a symlink");
  const directory = `states-${randomUUID()}`;
  await mkdir(join(store.filesDir, directory));
  for (let i = 0; i < previews.length; i++) {
    const preview = await isolatedPreview(previews[i]!);
    await writeFile(join(store.filesDir, directory, `${i}.html`), preview, { flag: "wx" });
  }
  const buttons = previews.map((p, i) => `<button type="button" data-state-index="${i}" aria-pressed="${i === 0}">${escapeHtml(p.name)}</button>`).join("");
  const options = previews.map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`).join("");
  const frames = previews.map((p, i) => `<iframe title="${escapeHtml(p.name)}" sandbox="allow-same-origin" src="/files/${directory}/${i}.html"${i ? " hidden" : ""}></iframe>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>States</title><link rel="stylesheet" href="/assets/state-rail.css"><script src="/assets/state-rail.js" defer></script></head><body><main>${frames}</main><nav aria-label="Preview states"><div class="vc-rail">${buttons}</div><label class="vc-mobile">State <select aria-label="Preview state">${options}</select></label></nav></body></html>`;
  await publish(args, html);
}

/** A fragment gets the vc-* stylesheet inside its sandbox; a whole document is kept as written. */
async function isolatedPreview(preview: { name: string; html: string }): Promise<string> {
  const mode = detectMode(preview.html);
  return renderScreen({ mode, title: preview.name, content: preview.html, isolated: true });
}

async function page(args: Args): Promise<void> {
  if (args.positional.length < 2 || args.positional.length % 2 !== 0) {
    throw new UsageError("page needs one or more name and file pairs");
  }
  if (["isolate", "plain", "bundle"].some((flag) => args.flags.has(flag))) {
    throw new UsageError("page does not accept --isolate, --plain or --bundle");
  }
  const parts = await readPairs(args.positional, "section");
  const whole = parts.find((part) => detectMode(part.html) === "plain");
  if (whole) throw new UsageError(`page sections must be fragments; "${whole.name}" is a whole document`);
  const html = composePage(parts);
  await publish(args, html);
}

async function readPairs(positional: string[], label: string): Promise<{ name: string; html: string }[]> {
  const pairs: { name: string; html: string }[] = [];
  for (let i = 0; i < positional.length; i += 2) {
    const name = positional[i]!;
    const file = positional[i + 1]!;
    if (!name.trim()) throw new UsageError(`${label} name must not be empty`);
    let html: string;
    try {
      html = await readFile(file, "utf8");
    } catch {
      throw new Error(`cannot read ${file}`);
    }
    if (!html.trim()) throw new Error(`${file} is empty`);
    pairs.push({ name, html });
  }
  return pairs;
}

async function stage(args: Args): Promise<void> {
  const [source, destination] = args.positional;
  if (!source || !destination || args.positional.length !== 2) throw new UsageError("stage needs a file and relative path");
  const parts = destination.split("/");
  if (destination === "__preview" || parts.some((part) => !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part))) {
    throw new UsageError("stage destination must be a relative path without dot segments");
  }
  if (!(await lstat(source)).isFile()) throw new Error("stage source must be a regular file");
  const { store } = runContext(args.flags);
  await store.init();
  if (!(await lstat(store.filesDir)).isDirectory()) throw new Error("session files must be a directory, not a symlink");
  let dir = store.filesDir;
  for (const part of parts.slice(0, -1)) {
    dir = join(dir, part);
    await mkdir(dir).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    if (!(await lstat(dir)).isDirectory()) throw new Error("stage destination contains a non-directory or symlink");
  }
  const target = join(dir, parts[parts.length - 1]!);
  await writeFile(target, await readFile(source), { flag: "wx" });
  emit({ path: target, url: `/files/${destination}` }, json(args.flags), [`staged: /files/${destination}`]);
}

async function events(args: Args): Promise<void> {
  const { store } = runContext(args.flags);
  if (args.flags.has("clear")) {
    await store.clearEvents();
    emit({ cleared: true }, json(args.flags), ["events cleared"]);
    return;
  }

  const waitRaw = args.flags.get("wait");
  if (typeof waitRaw === "string") {
    const limit = Number(waitRaw);
    if (!Number.isFinite(limit) || limit <= 0) throw new UsageError("--wait must be a positive number of seconds");
    const offset = await store.eventsSize();
    const deadline = Date.now() + limit * 1000;
    while (Date.now() < deadline) {
      const fresh = await store.eventsSince(offset);
      if (fresh.length > 0) {
        emit(fresh, json(args.flags), fresh.map(describeEvent));
        return;
      }
      await Bun.sleep(300);
    }
    emit([], json(args.flags), [`no choice within ${limit}s`]);
    return;
  }

  const all = await store.readEvents();
  emit(all, json(args.flags), all.length === 0 ? ["no events yet"] : all.map(describeEvent));
}

function describeEvent(event: { choice: string; text?: string; channel: string; at: number }): string {
  const when = new Date(event.at).toISOString().slice(11, 19);
  const label = event.text && event.text !== event.choice ? ` — ${event.text}` : "";
  return `${when}  ${event.choice}${label}  [${event.channel}]`;
}

async function components(args: Args): Promise<void> {
  const catalogue = JSON.parse(
    await readFile(join(import.meta.dir, "..", "assets", "catalogue.json"), "utf8"),
  ) as {
    modes: { mode: string; when: string }[];
    classes: { name: string; what: string }[];
    elements: { name: string; awhat?: string; attrs?: Record<string, string> }[];
    recorded: string;
  };

  if (json(args.flags)) {
    emit(catalogue, true, []);
    return;
  }

  const lines = [
    "modes:",
    ...catalogue.modes.map((mode) => `  ${mode.mode}: ${mode.when}`),
    "classes:",
    ...catalogue.classes.map((item) => `  ${item.name} — ${item.what}`),
    "elements:",
    ...catalogue.elements.map((item) => {
      const attrs = item.attrs ? ` (${Object.keys(item.attrs).join(", ")})` : "";
      return `  <${item.name}>${attrs}`;
    }),
    `recorded: ${catalogue.recorded}`,
  ];
  emit(catalogue, false, lines);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.has("help")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  switch (args.command) {
    case "start":
      return start(args.flags);
    case "serve":
      return serve(args.flags);
    case "status":
      return status(args.flags);
    case "stop":
      return stop(args.flags);
    case "push":
      return push(args);
    case "stage":
      return stage(args);
    case "compare":
      return compare(args);
    case "page":
      return page(args);
    case "states":
      return states(args);
    case "events":
      return events(args);
    case "components":
      return components(args);
    case "help":
      process.stdout.write(`${USAGE}\n`);
      return;
    default:
      throw new UsageError(`unknown command ${args.command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  if (error instanceof UsageError) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  process.exit(1);
});
