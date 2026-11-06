import "./globals";
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { currentHeading } from "../assets/components/contents.js";

test("current heading follows the reading line and selects the last at the bottom", () => {
  expect(currentHeading([], 120, false)).toBe(-1);
  expect(currentHeading([300, 500], 120, false)).toBe(0);
  expect(currentHeading([-80, 100, 130], 120, false)).toBe(1);
  expect(currentHeading([-80, 100, 130], 120, true)).toBe(2);
});

interface BrowserPage {
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: () => boolean): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>;
}
interface Browser {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}
interface Playwright {
  chromium: { launch(options: { executablePath: string; headless: boolean }): Promise<Browser> };
}
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let playwright: Playwright | undefined;
try { playwright = require("playwright") as Playwright; } catch {}

test.skipIf(!playwright || !existsSync(chrome))("contents generates and enhances native navigation, preserving authored links and rail controls", async () => {
  const html = `<!doctype html><html><body><main>
    <vc-contents id="generated" depth="3"></vc-contents>
    <vc-contents id="rail" variant="rail"><nav aria-label="My navigation"><ul>
      <li><a href="#existing">First</a></li><li><a href="#second">Second</a></li>
    </ul></nav></vc-contents>
    <h2 id="existing">First heading</h2><h3>Child heading</h3>
    <h2 id="second">Second heading</h2><h2>Missing id</h2>
    <vc-tab><h2>Hidden panel</h2></vc-tab><details><h2>Closed</h2></details>
    <div hidden><h2>Hidden</h2></div><details open><h2>Open</h2></details>
    <input id="input"><div style="height:2000px"></div>
  </main><script type="module">import { VcContents } from "/contents.js"; customElements.define("vc-contents", VcContents);</script></body></html>`;
  const server = Bun.serve({ port: 0, fetch(req) {
    if (new URL(req.url).pathname === "/contents.js") {
      return new Response(Bun.file(new URL("../assets/components/contents.js", import.meta.url)), { headers: { "content-type": "text/javascript" } });
    }
    return new Response(html, { headers: { "content-type": "text/html" } });
  } });
  // Register only this component so the fixture exercises the public element independently.
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${server.port}/`);
    await page.waitForFunction(() => document.querySelector("#generated")?.hasAttribute("data-ready") === true);
    const result = await page.evaluate(() => {
      const generated = document.querySelector("#generated")!;
      const rail = document.querySelector("#rail")!;
      const links = Array.from(generated.querySelectorAll("a"));
      const authored = Array.from(rail.querySelectorAll("a"));
      const target = document.querySelector<HTMLElement>("#second")!;
      let scrolled = 0;
      target.scrollIntoView = () => { scrolled++; };
      authored[1].dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
      const distances = authored.map((link) => link.getAttribute("data-distance"));
      const current = authored.map((link) => link.getAttribute("aria-current"));
      document.querySelector("#input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));
      const afterInput = scrolled;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true, cancelable: true }));
      const afterDigit = scrolled;
      const focused = document.activeElement?.textContent;
      rail.remove();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true, cancelable: true }));
      const afterDisconnect = scrolled;
      document.querySelector("main")!.prepend(rail);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true, cancelable: true }));
      return {
        labels: links.map((link) => link.querySelector(".vc-contents-name")?.textContent),
        nested: generated.querySelector("li ol a .vc-contents-name")?.textContent,
        assigned: document.querySelector("h3")?.id,
        navLabel: rail.querySelector("nav")?.getAttribute("aria-label"),
        authoredLabels: authored.map((link) => link.textContent),
        distances, current, afterInput, afterDigit, afterDisconnect, afterReconnect: scrolled, focused,
      };
    });
    expect(result.labels).toEqual(["First heading", "Child heading", "Second heading", "Missing id", "Open"]);
    expect(result.nested).toBe("Child heading");
    expect(result.assigned).toBe("vc-h-2-child-heading");
    expect(result.navLabel).toBe("My navigation");
    expect(result.authoredLabels).toEqual(["First", "Second"]);
    expect(result.distances).toEqual(["1", "0"]);
    expect(result.current.filter((value) => value === "location")).toHaveLength(1);
    expect([result.afterInput, result.afterDigit, result.afterDisconnect, result.afterReconnect]).toEqual([0, 1, 1, 2]);
    expect(result.focused).toBe("Second");
  } finally { await browser.close(); server.stop(true); }
});
