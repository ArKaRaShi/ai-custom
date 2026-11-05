import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { cookieName } from "../scripts/auth";

const CLI = join(import.meta.dir, "..", "scripts", "cli.ts");
let project = "";

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "vc-cli-"));
});

afterEach(async () => {
  await run(["stop", "--project-dir", project]);
  await rm(project, { recursive: true, force: true });
});

async function run(args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, out, err };
}

async function startCompanion(): Promise<{ url: string; port: number; runDir: string }> {
  const { code, out, err } = await run(["start", "--project-dir", project, "--json"]);
  expect(err).toBe("");
  expect(code).toBe(0);
  const info = JSON.parse(out) as { url: string; port: number; runDir: string };
  expect(info.url).toContain("?key=");
  return info;
}

describe("cli end to end", () => {
  test("start, push, serve, stop", async () => {
    const info = await startCompanion();

    const screenPath = join(project, "draft.html");
    await writeFile(screenPath, '<h1 class="vc-h1">Draft</h1><div class="vc-options"><button class="vc-option" data-choice="a">A</button></div>');

    const pushed = await run(["push", screenPath, "--project-dir", project, "--title", "Draft", "--json"]);
    expect(pushed.code).toBe(0);
    const screen = JSON.parse(pushed.out) as { screenId: number; mode: string; title: string };
    expect(screen.screenId).toBe(1);
    expect(screen.mode).toBe("bundle");
    expect(screen.title).toBe("Draft");

    const page = await (await fetch(info.url)).text();
    expect(page).toContain("Draft</h1>");
    expect(page).toContain("/assets/components.css");

    const status = await run(["status", "--project-dir", project, "--json"]);
    expect((JSON.parse(status.out) as { state: string }).state).toBe("running");

    const events = await run(["events", "--project-dir", project, "--json"]);
    expect(JSON.parse(events.out)).toEqual([]);

    const stopped = await run(["stop", "--project-dir", project, "--json"]);
    expect((JSON.parse(stopped.out) as { stopped: boolean }).stopped).toBe(true);

    const afterStop = await run(["status", "--project-dir", project, "--json"]);
    expect((JSON.parse(afterStop.out) as { state: string }).state).toBe("stopped");
  }, 30_000);

  test("project layout preserves existing data and stages only explicitly named files", async () => {
    const root = join(project, ".visual-companion");
    await mkdir(join(root, "previews"), { recursive: true });
    await writeFile(join(root, "previews", "draft.html"), "original");
    await writeFile(join(root, "legacy.txt"), "keep");
    const info = await startCompanion();
    const source = join(project, "style.css");
    await writeFile(source, "body { color: red }");
    expect((await run(["stage", source, "css/style.css", "--project-dir", project])).code).toBe(0);
    const response = await fetch(`${info.url.replace(/\?.*$/, "")}files/css/style.css?key=${new URL(info.url).searchParams.get("key")}`);
    expect(await response.text()).toContain("color: red");
    expect((await fetch(`${info.url.replace(/\?.*$/, "")}files/legacy.txt?key=${new URL(info.url).searchParams.get("key")}`)).status).toBe(404);
    expect(await readFile(join(root, "previews", "draft.html"), "utf8")).toBe("original");
    expect(await readFile(join(root, "legacy.txt"), "utf8")).toBe("keep");
    expect((await run(["stage", source, "css/style.css", "--project-dir", project])).code).toBe(1);
    expect((await run(["stage", source, "../escape", "--project-dir", project])).code).toBe(2);
    await symlink(project, join(info.runDir, "files", "link"));
    expect((await run(["stage", source, "link/escape", "--project-dir", project])).code).toBe(1);
    expect((await fetch(`${info.url.replace(/\?.*$/, "")}files/link/style.css?key=${new URL(info.url).searchParams.get("key")}`)).status).toBe(404);
  }, 30_000);

  test("compare publishes separately sandboxed static previews", async () => {
    const info = await startCompanion();
    const first = join(project, "first.html");
    const second = join(project, "second.html");
    await writeFile(first, '<style>body{color:red}</style><script>throw 1</script>First');
    await writeFile(second, '<style>body{color:blue}</style>Second');
    await writeFile(join(project, "secret.txt"), "private");
    const result = await run(["compare", 'A <one>', first, 'B "two"', second, "--project-dir", project, "--json"]);
    expect(result.code).toBe(0);
    const page = await (await fetch(info.url)).text();
    expect(page).toContain("A &lt;one&gt;");
    expect(page).toContain("B &quot;two&quot;");
    expect(page).toContain("auto-fit");
    const urls = [...page.matchAll(/<iframe title="[^"]*" sandbox="allow-same-origin" src="([^"]+)"/g)].map((m) => m[1]!);
    expect(urls).toHaveLength(2);
    expect(urls[0]).not.toBe(urls[1]);
    for (const [i, url] of urls.entries()) {
      const response = await fetch(new URL(`${url}?key=${new URL(info.url).searchParams.get("key")}`, info.url));
      expect(response.headers.get("content-security-policy")).toContain("sandbox allow-same-origin; default-src 'none'");
      expect(await response.text()).toContain(i === 0 ? "color:red" : "color:blue");
    }
    expect((await fetch(new URL(`/files/secret.txt?key=${new URL(info.url).searchParams.get("key")}`, info.url))).status).toBe(404);
    expect((await run(["compare", "only", first, "--project-dir", project])).code).toBe(2);
    expect((await run(["compare", "one", first, "two", join(project, "missing"), "--project-dir", project])).code).toBe(1);
    expect(await (await fetch(info.url)).text()).toBe(page);
  }, 30_000);

  test("states publishes isolated full-page previews and preserves the previous publication on failure", async () => {
    const info = await startCompanion();
    const a = join(project, "a.html");
    const b = join(project, "b.html");
    await writeFile(a, '<style>body{color:red}</style>first');
    await writeFile(b, '<style>body{color:blue}</style>second');
    expect((await run(["states", "First", a, "Second", b, "--project-dir", project])).code).toBe(0);
    const page = await (await fetch(info.url)).text();
    expect(page).toContain('/assets/state-rail.js');
    expect(page).toContain('aria-label="Preview state"');
    const urls = [...page.matchAll(/sandbox="allow-same-origin" src="([^"]+)"/g)].map((m) => m[1]!);
    expect(urls).toHaveLength(2);
    for (const [i, url] of urls.entries()) {
      const response = await fetch(new URL(`${url}?key=${new URL(info.url).searchParams.get("key")}`, info.url));
      expect(response.headers.get("content-security-policy")).toContain("sandbox allow-same-origin; default-src 'none'");
      expect(await response.text()).toContain(i ? 'color:blue' : 'color:red');
    }
    expect((await run(["states", "Missing", join(project, "missing"), "--project-dir", project])).code).toBe(1);
    expect(await (await fetch(info.url)).text()).toBe(page);
  }, 30_000);

  test("stale startup, relative paths and private state", async () => {
    const root = join(project, ".visual-companion");
    const state = join(root, "sessions", "existing", "state");
    await mkdir(state, { recursive: true });
    await writeFile(join(root, "active-session"), "existing\n");
    await writeFile(join(state, "server.json"), JSON.stringify({ pid: 99999999 }));
    const result = await run(["start", "--project-dir", relative(process.cwd(), project), "--json"]);
    expect(result.code).toBe(0);
    const info = JSON.parse(result.out);
    expect(info.runDir).toBe(join(project, ".visual-companion", "sessions", "existing"));
    expect((await stat(join(state, "server.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(state, "server.log"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(state, "server.log"), "utf8")).not.toContain(info.key);
  }, 30_000);

  test("project ignore rules preserve existing content and ignore all companion files", async () => {
    const root = join(project, ".visual-companion");
    await mkdir(root, { recursive: true });
    await writeFile(join(project, ".gitignore"), "root-rule\n");
    await writeFile(join(root, ".gitignore"), "*\n!previews/\n!previews/keep.html");
    await startCompanion();
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("*\n!previews/\n!previews/keep.html\n*\n");
    await startCompanion();
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe("*\n!previews/\n!previews/keep.html\n*\n");
    expect(await readFile(join(project, ".gitignore"), "utf8")).toBe("root-rule\n");
    const init = Bun.spawnSync(["git", "init", "-q", project]);
    expect(init.exitCode).toBe(0);
    for (const path of ["previews/keep.html", "styles/a.css", "sessions/id/state/key", ".gitignore"]) {
      expect(Bun.spawnSync(["git", "-C", project, "check-ignore", "-q", `.visual-companion/${path}`]).exitCode).toBe(0);
    }
  }, 30_000);

  test("start is idempotent", async () => {
    const first = await startCompanion();
    expect(await readFile(join(project, ".visual-companion", ".gitignore"), "utf8")).toBe("*\n");
    const second = await startCompanion();
    expect(second.port).toBe(first.port);
    expect(second.url).toBe(first.url);
  }, 30_000);

  test("stale restart reconnects, but explicit stop starts a fresh session without deleting history", async () => {
    const first = await startCompanion();
    const screen = join(project, "screen.html");
    await writeFile(screen, "old screen");
    await run(["push", screen, "--project-dir", project]);
    await writeFile(join(first.runDir, "state", "events.jsonl"), '{"choice":"old"}\n');
    const status = JSON.parse((await run(["status", "--project-dir", project, "--json"])).out);
    process.kill(status.info.pid, "SIGKILL");
    await Bun.sleep(200);
    const restarted = await startCompanion();
    expect(restarted.url).toBe(first.url);
    expect(restarted.runDir).toBe(first.runDir);
    await run(["stop", "--project-dir", project]);
    const fresh = await startCompanion();
    expect(fresh.runDir).not.toBe(first.runDir);
    expect(await (await fetch(fresh.url)).text()).not.toContain("old screen");
    expect(JSON.parse((await run(["events", "--project-dir", project, "--json"])).out)).toEqual([]);
    expect(await readFile(join(first.runDir, "content", "001-screen.html"), "utf8")).toBe("old screen");
    expect(await readFile(join(first.runDir, "state", "events.jsonl"), "utf8")).toContain('"old"');
  }, 30_000);

  test("concurrent first commands resolve a fully initialized active session", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => run(["status", "--project-dir", project, "--json"])));
    expect(results.every((result) => result.code === 0)).toBe(true);
    expect(new Set(results.map((result) => JSON.parse(result.out).runDir)).size).toBe(1);
  }, 30_000);

  test("pushing again notifies a connected browser", async () => {
    const info = await startCompanion();
    const socket = new WebSocket(`ws://127.0.0.1:${info.port}/ws`, {
      headers: { cookie: `${cookieName(new URL(info.url).searchParams.get("key")!)}=${new URL(info.url).searchParams.get("key")}` },
    } as unknown as string[]);
    await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));

    const reload = new Promise<string>((resolve) => {
      socket.addEventListener("message", (event) => resolve(String((event as MessageEvent).data)));
    });

    const screenPath = join(project, "second.html");
    await writeFile(screenPath, "<p>second</p>");
    const pushed = await run(["push", screenPath, "--project-dir", project, "--json"]);
    expect((JSON.parse(pushed.out) as { reloaded: boolean }).reloaded).toBe(true);
    expect(JSON.parse(await reload)).toMatchObject({ type: "reload", screenId: 1 });
    socket.close();
  }, 30_000);

  test("events --wait returns the first choice", async () => {
    const info = await startCompanion();
    const key = new URL(info.url).searchParams.get("key") ?? "";
    const eventsUrl = `${info.url.replace(/\?.*$/, "")}events`;
    const cookie = `${cookieName(key)}=${key}`;
    const previous = await fetch(eventsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ type: "choice", choice: "猫😀", text: "é" }),
    });
    expect(previous.status).toBe(200);

    const waiter = run(["events", "--project-dir", project, "--wait", "10", "--json"]);
    await Bun.sleep(400);
    const posted = await fetch(eventsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ type: "choice", choice: "b", text: "Option B" }),
    });
    expect(posted.status).toBe(200);

    const result = await waiter;
    expect(result.code).toBe(0);
    const events = JSON.parse(result.out) as { choice: string; channel: string }[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ choice: "b", channel: "http" });
  }, 30_000);

  test("push fails clearly for a missing file and usage errors exit 2", async () => {
    const missing = await run(["push", join(project, "nope.html"), "--project-dir", project]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("cannot read");

    const usage = await run(["nonsense"]);
    expect(usage.code).toBe(2);
    expect(usage.err).toContain("unknown command");
  }, 20_000);
});
