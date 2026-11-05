import { existsSync } from "node:fs";
import { open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

export interface RunInfo {
  pid: number;
  port: number;
  url: string;
  key: string;
  runDir: string;
  startedAt: number;
}

/** One explicit state instead of scattered pid-file checks. */
export type Status =
  | { state: "stopped" }
  | { state: "running"; info: RunInfo }
  | { state: "stale"; info: RunInfo };

export function runInfoPath(runDir: string): string {
  return join(runDir, "state", "server.json");
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readStatus(runDir: string): Promise<Status> {
  if (!existsSync(runInfoPath(runDir))) return { state: "stopped" };
  try {
    const info = JSON.parse(await readFile(runInfoPath(runDir), "utf8")) as RunInfo;
    if (!info.pid || !isAlive(info.pid)) return { state: "stale", info };
    return { state: "running", info };
  } catch {
    return { state: "stopped" };
  }
}

export async function writeRunInfo(runDir: string, info: RunInfo): Promise<void> {
  const path = runInfoPath(runDir);
  const file = await open(path, "a", 0o600);
  try {
    await file.chmod(0o600);
    await file.truncate(0);
    await file.writeFile(`${JSON.stringify(info, null, 2)}\n`, "utf8");
  } finally {
    await file.close();
  }
}

export async function clearRunInfo(runDir: string): Promise<void> {
  await rm(runInfoPath(runDir), { force: true });
}

export interface StartOptions {
  runDir: string;
  cliPath: string;
  port?: number;
  host?: string;
  idleMinutes?: number;
  ownerPid?: number | null;
  logPath: string;
}

/**
 * Spawns the server detached and waits for it to publish `server.json`. The run
 * file is the only handshake, so there is no pid guessing on the caller side.
 */
export async function startDetached(options: StartOptions): Promise<RunInfo> {
  const logFile = await open(options.logPath, "a", 0o600);
  await logFile.chmod(0o600);
  await logFile.close();
  const args = [
    "bun",
    options.cliPath,
    "serve",
    "--run-dir",
    options.runDir,
    "--log",
    options.logPath,
  ];
  if (options.port) args.push("--port", String(options.port));
  if (options.host) args.push("--host", options.host);
  if (options.idleMinutes) args.push("--idle-minutes", String(options.idleMinutes));
  if (options.ownerPid) args.push("--owner-pid", String(options.ownerPid));

  if (process.platform === "win32") {
    Bun.spawn(args, {
      stdio: ["ignore", "ignore", "ignore"],
      cwd: join(options.cliPath, "..", ".."),
    }).unref();
  } else {
    const command = `cd ${shellQuote(join(options.cliPath, "..", ".."))} && nohup ${args.map(shellQuote).join(" ")} >> ${shellQuote(options.logPath)} 2>&1 &`;
    const shell = Bun.spawn(["bash", "-c", command], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    shell.unref();
  }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await Bun.sleep(120);
    const status = await readStatus(options.runDir);
    if (status.state === "running") return status.info;
  }
  throw new Error(`server did not start; see ${options.logPath}`);
}

export async function stopServer(info: RunInfo): Promise<boolean> {
  if (!isAlive(info.pid)) {
    await clearRunInfo(info.runDir);
    return false;
  }
  try {
    process.kill(info.pid, "SIGTERM");
  } catch {
    /* raced with exit */
  }
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if (!isAlive(info.pid)) break;
    await Bun.sleep(80);
  }
  if (isAlive(info.pid)) {
    try {
      process.kill(info.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  await clearRunInfo(info.runDir);
  return true;
}

export function openBrowser(url: string): boolean {
  const launchers: Record<string, string[]> = {
    darwin: ["open", url],
    win32: ["rundll32.exe", "url.dll,FileProtocolHandler", url],
    linux: ["xdg-open", url],
  };
  const argv = launchers[process.platform];
  if (!argv) return false;
  try {
    Bun.spawn(argv, { stdio: ["ignore", "ignore", "ignore"] }).unref();
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
