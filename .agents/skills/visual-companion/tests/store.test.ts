import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../scripts/store";

let root = "";
let store: SessionStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vc-store-"));
  store = new SessionStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("SessionStore", () => {
  test("current() is null before anything is pushed", async () => {
    expect(await store.current()).toBeNull();
  });

  test("push publishes the screen and detects its mode", async () => {
    const screen = await store.push("<h2>hi</h2>", { title: "First" });
    expect(screen.screenId).toBe(1);
    expect(screen.mode).toBe("bundle");
    expect(screen.title).toBe("First");

    const published = await store.current();
    expect(published?.content).toBe("<h2>hi</h2>");
    expect(published?.screen.file).toBe("001-screen.html");
  });

  test("push honours a forced mode", async () => {
    const screen = await store.push("<h2>hi</h2>", { mode: "plain" });
    expect(screen.mode).toBe("plain");
  });

  test("screen ids increase and never collide", async () => {
    await store.push("a");
    const second = await store.push("b");
    const third = await store.push("c");
    expect(second.screenId).toBe(2);
    expect(third.screenId).toBe(3);
    expect((await store.current())?.content).toBe("c");
  });

  test("pushing a new screen clears the previous events", async () => {
    await store.push("a");
    await store.appendEvent({ type: "choice", choice: "x", text: "", channel: "ws", at: 1 });
    expect(await store.readEvents()).toHaveLength(1);

    await store.push("b");
    expect(await store.readEvents()).toHaveLength(0);
  });

  test("eventsSince only returns what arrived after the offset", async () => {
    await store.push("a");
    await store.appendEvent({ type: "choice", choice: "one", text: "", channel: "ws", at: 1 });
    const offset = await store.eventsSize();
    expect(await store.eventsSince(offset)).toHaveLength(0);

    await store.appendEvent({ type: "choice", choice: "two", text: "", channel: "form", at: 2 });
    const fresh = await store.eventsSince(offset);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.choice).toBe("two");
  });

  test("eventsSince resumes at a UTF-8 byte offset after Unicode events", async () => {
    await store.appendEvent({ type: "choice", choice: "猫😀", text: "é", channel: "ws", at: 1 });
    const offset = await store.eventsSize();
    await store.appendEvent({ type: "choice", choice: "next", text: "✓", channel: "form", at: 2 });
    const fresh = await store.eventsSince(offset);
    expect(fresh).toEqual([
      { type: "choice", choice: "next", text: "✓", channel: "form", at: 2 },
    ]);
  });

  test("current() is null when the screen file disappeared behind the pointer", async () => {
    const screen = await store.push("a");
    await unlink(join(store.screensDir, screen.file));
    expect(await store.current()).toBeNull();
  });

  test("corrupt event lines are skipped, not fatal", async () => {
    await store.push("a");
    await Bun.write(store.eventsPath, '{"type":"choice","choice":"ok","text":"","channel":"ws","at":1}\nnot json\n');
    const events = await store.readEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.choice).toBe("ok");
  });
});
