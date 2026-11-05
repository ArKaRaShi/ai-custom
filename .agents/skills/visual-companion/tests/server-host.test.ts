import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../scripts/server";
import { SessionStore } from "../scripts/store";

test.each([
  ["0.0.0.0", "127.0.0.1"],
  ["::", "[::1]"],
  ["::1", "[::1]"],
])("advertises a reachable URL for bind host %s", async (host, expectedHost) => {
  const prefix = join(tmpdir(), "vc-host-");
  const root = await mkdtemp(prefix);
  const store = new SessionStore(root);
  await store.init();
  const server = startServer({ store, key: "test-key", host });
  try {
    const url = new URL(server.url);
    expect(url.host).toBe(`${expectedHost}:${server.port}`);
    const response = await fetch(server.url);
    expect(response.status).toBe(200);
  } finally {
    await server.stop();
    await rm(root, { recursive: true, force: true });
  }
});
