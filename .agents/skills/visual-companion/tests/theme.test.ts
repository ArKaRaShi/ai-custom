import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const client = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
const early = readFileSync(new URL("../assets/theme.js", import.meta.url), "utf8");
const frame = readFileSync(new URL("../assets/frame.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/components.css", import.meta.url), "utf8");

test("early theme is limited to valid saved values and tolerates blocked storage", () => {
  expect(frame.indexOf('/assets/theme.js')).toBeLessThan(frame.indexOf('/assets/components.css'));
  for (const value of ["light", "dark", "system", "invalid", null]) {
    let applied: string | undefined;
    runInNewContext(early, { localStorage: { getItem: () => value }, document: { documentElement: { setAttribute: (_: string, v: string) => { applied = v; } } } });
    expect(applied).toBe(value === "light" || value === "dark" ? value : undefined);
  }
  expect(() => runInNewContext(early, { localStorage: { getItem: () => { throw Error(); } } })).not.toThrow();
});

test("neutral presets provide both palettes and explicit system override", () => {
  for (const color of ["#f6f6f7", "#ffffff", "#16181d", "#5b6270", "#d9dce2", "#3b62f6", "#14161a", "#1c1f25", "#e8eaee", "#a2a9b6", "#2f343d", "#7d9bff"]) expect(css).toContain(color);
  expect(css).toContain(':root:not([data-vc-theme="light"]):not([data-vc-theme="dark"])');
  expect(css).toContain(':root[data-vc-theme="dark"]');
});

test("theme selection persists, handles unavailable storage, and leaves plain pages alone", () => {
  function setup(initial: string | null, present = true, fail = false) {
    const attrs: Record<string, string> = {};
    let saved = initial;
    const select = { value: "", change: () => {}, addEventListener(_: string, fn: () => void) { this.change = fn; } };
    const root = { setAttribute(k: string, v: string) { attrs[k] = v; }, removeAttribute(k: string) { delete attrs[k]; } };
    const document = {
      documentElement: root,
      querySelector: (s: string) => s === "[data-vc-theme-select]" && present ? select : null,
      createElement: () => ({ style: {} }), addEventListener: () => {}, body: { append: () => {} },
    };
    class Socket { addEventListener() {} }
    const localStorage = { getItem() { if (fail) throw Error(); return saved; }, setItem(_: string, v: string) { if (fail) throw Error(); saved = v; } };
    runInNewContext(client, { document, localStorage, location: { protocol: "http:", host: "localhost" }, WebSocket: Socket });
    return { attrs, select, get saved() { return saved; } };
  }
  const screen = setup("dark");
  expect(screen.attrs["data-vc-theme"]).toBe("dark");
  screen.select.value = "light"; screen.select.change();
  expect(screen.attrs["data-vc-theme"]).toBe("light");
  expect(screen.saved).toBe("light");
  screen.select.value = "system"; screen.select.change();
  expect(screen.attrs["data-vc-theme"]).toBeUndefined();
  const blocked = setup(null, true, true);
  blocked.select.value = "dark"; blocked.select.change();
  expect(blocked.attrs["data-vc-theme"]).toBe("dark");
  expect(setup("dark", false).attrs).toEqual({});
});
