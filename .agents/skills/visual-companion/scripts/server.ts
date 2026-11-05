import { cookieHeader, cookieName, isAuthorized, originAllowed, parseCookies } from "./auth";
import { parseChoiceEvent } from "./domain";
import { EventFeed, type EventSocket } from "./feed";
import { htmlResponse, inside, jsonResponse, notFound } from "./http";
import { ASSETS_DIR, emptyState, escapeHtml, forbiddenPage, mimeFor, renderScreen } from "./render";
import type { SessionStore } from "./store";

export interface ServerOptions {
  store: SessionStore;
  key: string;
  port?: number;
  host?: string;
}

export interface RunningServer {
  port: number;
  url: string;
  feed: EventFeed;
  /** Milliseconds since the last authorised request or event. */
  idleFor: () => number;
  stop: () => Promise<void>;
}

export function startServer(options: ServerOptions): RunningServer {
  const { store, key } = options;
  const host = options.host ?? "127.0.0.1";
  const feed = new EventFeed(store);
  let lastActivity = Date.now();

  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: host,
    idleTimeout: 0,
    async fetch(req, srv): Promise<Response> {
      try {
        const url = new URL(req.url);

        if (url.pathname === "/ws") {
          if (!isAuthorized(req, key) || !originAllowed(req)) {
            return new Response("Forbidden", { status: 403 });
          }
          lastActivity = Date.now();
          if (srv.upgrade(req)) return undefined as unknown as Response;
          return new Response("Upgrade failed", { status: 400 });
        }

        if (!isAuthorized(req, key)) return htmlResponse(forbiddenPage(), 403);
        lastActivity = Date.now();

        // Any authorised hit that arrived by query string leaves a cookie behind,
        // so the page's own asset requests stay authorised. No redirect: agents
        // and curl fetch the screen in one hop.
        const needsCookie = url.searchParams.has("key") && parseCookies(req.headers.get("cookie"))[cookieName(key)] !== key;
        const withCookie = (response: Response): Response => {
          if (needsCookie) response.headers.append("set-cookie", cookieHeader(key));
          return response;
        };

        if (url.pathname === "/" || url.pathname === "/index.html") {
          const published = await store.current();
          if (!published) return withCookie(htmlResponse(await emptyState()));
          if (published.screen.isolated) {
            return withCookie(htmlResponse(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(published.screen.title)}</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><script src="/assets/client.js" defer></script></head><body><iframe title="${escapeHtml(published.screen.title)}" sandbox="allow-same-origin" src="/files/__preview"></iframe></body></html>`));
          }
          return withCookie(
            htmlResponse(
              await renderScreen({
                mode: published.screen.mode,
                title: published.screen.title,
                content: published.content,
              }),
            ),
          );
        }

        if (url.pathname === "/files/__preview") {
          const published = await store.current();
          if (!published?.screen.isolated) return notFound();
          const response = htmlResponse(await renderScreen({
            mode: published.screen.mode,
            title: published.screen.title,
            content: published.content,
            isolated: true,
          }));
          response.headers.set("content-security-policy", "sandbox allow-same-origin; default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:");
          return response;
        }

        if (url.pathname.startsWith("/assets/")) {
          const path = await inside(ASSETS_DIR, url.pathname.slice(8));
          if (!path) return notFound();
          return new Response(Bun.file(path), { headers: { "content-type": mimeFor(path) } });
        }

        if (url.pathname.startsWith("/files/")) {
          const path = await inside(store.filesDir, url.pathname.slice(7));
          if (!path) return notFound();
          return new Response(Bun.file(path), { headers: {
            "content-type": mimeFor(path),
            "content-security-policy": "sandbox allow-same-origin; default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:",
            "x-content-type-options": "nosniff",
          } });
        }

        if (url.pathname === "/events" && req.method === "POST") {
          const body = await req.text();
          const isJson = body.trimStart().startsWith("{");
          const input = isJson ? safeJson(body) : formChoice(body);
          const now = Date.now();
          const event = parseChoiceEvent(input, isJson ? "http" : "form", now);
          if (!event) return jsonResponse({ ok: false, error: "invalid choice" }, 400);
          await feed.record(event);
          return jsonResponse({ ok: true, event });
        }

        if (url.pathname === "/internal/reload" && req.method === "POST") {
          const body = safeJson(await req.text());
          const screenId = typeof body?.screenId === "number" ? body.screenId : null;
          feed.broadcastReload(screenId);
          return jsonResponse({ ok: true, clients: feed.size });
        }

        if (url.pathname === "/health") {
          const published = await store.current();
          return jsonResponse({
            ok: true,
            pid: process.pid,
            port: srv.port,
            screenId: published?.screen.screenId ?? null,
            mode: published?.screen.mode ?? null,
            clients: feed.size,
          });
        }

        return notFound();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse({ ok: false, error: message }, 500);
      }
    },
    websocket: {
      open(socket: EventSocket) {
        lastActivity = Date.now();
        feed.attach(socket);
      },
      message(_socket: EventSocket, raw: string | Buffer) {
        const text = typeof raw === "string" ? raw : raw.toString();
        const event = parseChoiceEvent(safeJson(text), "ws", Date.now());
        if (event) {
          lastActivity = Date.now();
          void feed.record(event);
        }
      },
      close(socket: EventSocket) {
        feed.detach(socket);
      },
    },
  });

  const connectHost = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  const urlHost = connectHost.includes(":") && !connectHost.startsWith("[") ? `[${connectHost}]` : connectHost;

  return {
    port: server.port ?? 0,
    url: `http://${urlHost}:${server.port}/?key=${key}`,
    feed,
    idleFor: () => Date.now() - lastActivity,
    stop: () => server.stop(true),
  };
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function formChoice(body: string): Record<string, unknown> | null {
  const form = new URLSearchParams(body);
  if (!form.has("choice")) return null;
  return { type: "choice", choice: form.get("choice"), text: form.get("text") ?? "" };
}
