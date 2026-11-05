import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cookieName } from "../scripts/auth";
import { startServer, type RunningServer } from "../scripts/server";
import { SessionStore } from "../scripts/store";

const KEY = "test-key-0123456789";
let root = "";
let store: SessionStore;
let server: RunningServer;
let base = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "vc-server-"));
  store = new SessionStore(root);
  await store.init();
  server = startServer({ store, key: KEY, port: 0 });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  await server.stop();
  await rm(root, { recursive: true, force: true });
});

afterEach(async () => {
  await store.clearEvents();
});

const auth = { cookie: `${cookieName(KEY)}=${KEY}` };

describe("http surface", () => {
  test("requests without the key are refused", async () => {
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("a wrong key is refused too", async () => {
    const response = await fetch(`${base}/?key=wrong`);
    expect(response.status).toBe(403);
  });

  test("the key in the query serves the page and leaves a cookie behind", async () => {
    const response = await fetch(`${base}/?key=${KEY}`);
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${cookieName(KEY)}=${KEY}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    const again = await fetch(`${base}/?key=${KEY}`, { headers: auth });
    expect(again.status).toBe(200);
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  test("empty session renders the empty state", async () => {
    const response = await fetch(`${base}/`, { headers: auth });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Waiting for a screen");
    expect(html).toContain("data-vc-empty-copy");
    expect(html).toContain('role="status"');
    expect(html).toContain("Connecting…");
    expect(html).not.toContain("bun scripts/cli.ts");
    expect(html).toContain("/assets/components.css");
  });

  test("a fragment is wrapped in the frame with its title escaped", async () => {
    await store.push('<div class="vc-card"><h2>Pick</h2></div>', { title: '<script>x</script>' });
    const html = await (await fetch(`${base}/`, { headers: auth })).text();
    expect(html).toContain('<div class="vc-card"><h2>Pick</h2></div>');
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("/assets/client.js");
  });

  test("frame preserves replacement metacharacters in titles and content", async () => {
    const title = "Price $$ $& $` $'";
    const content = "<p>Value $$ $& $` $'</p>";
    await store.push(content, { title });
    const response = await fetch(`${base}/`, { headers: auth });
    const html = await response.text();
    expect(html).toContain(`<title>Price $$ $&amp; $\` $'</title>`);
    expect(html).toContain(`<span class="vc-bar-title">Price $$ $&amp; $\` $'</span>`);
    expect(html).toContain(content);
  });

  test("a full document is served untouched apart from the client", async () => {
    await store.push("<!doctype html><html><body><p id=mine>keep my styles</p></body></html>");
    const html = await (await fetch(`${base}/`, { headers: auth })).text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("id=mine");
    expect(html).toContain("/assets/client.js");
    expect(html).not.toContain("vc-bar");
    expect(html).not.toContain("/assets/components.css");
  });

  test("isolated preview is sandboxed and ordinary screens remain interactive", async () => {
    await store.push('<!doctype html><link rel="stylesheet" href="css/site.css"><script>evil()</script>', { isolated: true });
    const shell = await (await fetch(`${base}/`, { headers: auth })).text();
    expect(shell).toContain('sandbox="allow-same-origin" src="/files/__preview"');
    expect(shell).not.toContain("evil()");
    const preview = await fetch(`${base}/files/__preview`, { headers: auth });
    expect(preview.headers.get("content-security-policy")).toContain("sandbox allow-same-origin; default-src 'none'");
    expect(await preview.text()).toContain('href="css/site.css"');
    expect((await fetch(`${base}/files/__preview`)).status).toBe(403);
    await store.push('<button data-choice="a">A</button>');
    expect(await (await fetch(`${base}/`, { headers: auth })).text()).toContain('data-choice="a"');
    expect((await fetch(`${base}/files/__preview`, { headers: auth })).status).toBe(404);
  });

  test("isolated bundle preview shows content without inert frame controls", async () => {
    await store.push('<p class="vc-card">Preview</p>', { isolated: true });
    const response = await fetch(`${base}/files/__preview`, { headers: auth });
    const html = await response.text();
    expect(html).toContain('<p class="vc-card">Preview</p>');
    expect(html).toContain("/assets/components.css");
    expect(html).not.toContain("data-vc-theme-select");
    expect(html).not.toContain("data-vc-status");
    expect(html).not.toContain("<script");
  });

  test("assets are served with a real content type", async () => {
    const css = await fetch(`${base}/assets/components.css`, { headers: auth });
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    expect((await css.text()).length).toBeGreaterThan(1000);
  });

  test("asset and file lookups refuse traversal, dotfiles and directories", async () => {
    for (const path of ["/assets/../scripts/cli.ts", "/assets/.hidden", "/files/nope.png"]) {
      const response = await fetch(`${base}${path}`, { headers: auth });
      expect(response.status).toBe(404);
    }
  });

  test("a file dropped into files/ is served", async () => {
    await mkdir(store.filesDir, { recursive: true });
    await writeFile(join(store.filesDir, "shot.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    const response = await fetch(`${base}/files/shot.svg`, { headers: auth });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg");
  });

  test("staged active documents are sandboxed", async () => {
    for (const name of ["active.html", "active.svg"]) {
      await writeFile(join(store.filesDir, name), "<script>fetch('/events')</script>");
      const response = await fetch(`${base}/files/${name}`, { headers: auth });
      expect(response.headers.get("content-security-policy")).toContain("sandbox allow-same-origin; default-src 'none'");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  test("two servers retain distinct cookies across ports", async () => {
    const other = startServer({ store, key: "another-key" });
    try {
      const response = await fetch(`http://127.0.0.1:${other.port}/?key=another-key`);
      const first = (await fetch(`${base}/?key=${KEY}`)).headers.get("set-cookie")!.split(";")[0];
      const second = response.headers.get("set-cookie")!.split(";")[0];
      const headers = { cookie: `${first}; ${second}` };
      expect((await fetch(`${base}/health`, { headers })).status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${other.port}/health`, { headers })).status).toBe(200);
    } finally { await other.stop(); }
  });

  test("health reports the published screen", async () => {
    await store.push("<p>health</p>");
    const body = (await (await fetch(`${base}/health`, { headers: auth })).json()) as {
      ok: boolean;
      screenId: number;
    };
    expect(body.ok).toBe(true);
    expect(body.screenId).toBeGreaterThan(0);
  });
});

describe("events", () => {
  test("POST /events records a json choice", async () => {
    await store.push("<p>x</p>");
    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ type: "choice", choice: "b", text: "Option B" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, event: { choice: "b", channel: "http" } });
    const events = await store.readEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.choice).toBe("b");
    expect(events[0]?.channel).toBe("http");
  });

  test("POST /events records a form post (the no-js path)", async () => {
    await store.push("<p>x</p>");
    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
      body: "choice=a&text=Option+A",
    });
    expect(response.status).toBe(200);
    const events = await store.readEvents();
    expect(events[0]).toMatchObject({ choice: "a", text: "Option A", channel: "form" });
  });

  test("invalid events are rejected, not stored", async () => {
    await store.push("<p>x</p>");
    const response = await fetch(`${base}/events`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ type: "choice" }),
    });
    expect(response.status).toBe(400);
    expect(await store.readEvents()).toHaveLength(0);
  });

  test("a websocket choice is recorded and broadcast", async () => {
    await store.push("<p>x</p>");
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
      headers: auth,
    } as unknown as string[]);
    const seen: string[] = [];

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("socket failed")));
      setTimeout(() => reject(new Error("socket timeout")), 3000);
    });

    socket.addEventListener("message", (event) => {
      seen.push(String((event as MessageEvent).data));
    });
    socket.send(JSON.stringify({ type: "choice", choice: "c", text: "Option C" }));

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && (await store.readEvents()).length === 0) {
      await Bun.sleep(50);
    }
    const events = await store.readEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ choice: "c", channel: "ws" });
    expect(server.feed.size).toBe(1);
    socket.close();
  });

  test("a websocket upgrade from another origin is refused", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
      headers: { cookie: `${cookieName(KEY)}=${KEY}`, origin: "http://evil.example" },
    } as unknown as string[]);
    const outcome = await new Promise<string>((resolve) => {
      socket.addEventListener("open", () => resolve("open"));
      socket.addEventListener("error", () => resolve("rejected"));
      setTimeout(() => resolve("timeout"), 2000);
    });
    expect(outcome).toBe("rejected");
  });

  test("reload is broadcast to connected browsers", async () => {
    await store.push("<p>x</p>");
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
      headers: auth,
    } as unknown as string[]);
    await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));

    const message = new Promise<string>((resolve) => {
      socket.addEventListener("message", (event) => resolve(String((event as MessageEvent).data)));
    });
    const response = await fetch(`${base}/internal/reload`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ screenId: 7 }),
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(await message)).toEqual({ type: "reload", screenId: 7 });
    socket.close();
  });
});
