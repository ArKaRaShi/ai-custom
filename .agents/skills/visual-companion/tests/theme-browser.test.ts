import { expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

// Optional integration smoke: no browser dependency is required for the unit suite.
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let playwright: any;
try { playwright = require("playwright"); } catch {}
if (!playwright || !existsSync(chrome)) {
  console.warn("Browser smoke skipped: install playwright and Google Chrome to run it.");
}

test.skipIf(!playwright || !existsSync(chrome))("saved theme is applied before CSS, with contrast and isolated previews", async () => {
  const assets = new URL("../assets/", import.meta.url);
  const frame = readFileSync(new URL("frame.html", assets), "utf8")
    .replaceAll("<!--VC:TITLE-->", "Smoke")
    .replace("<!--VC:CONTENT-->", '<iframe sandbox="allow-same-origin" src="/preview"></iframe>');
  const server = Bun.serve({ port: 0, async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/") return new Response(frame, { headers: { "content-type": "text/html", "content-security-policy": "default-src 'self'; frame-src 'self'" } });
    if (path === "/preview") return new Response('<!doctype html><html><body>Preview</body></html>', { headers: { "content-type": "text/html", "content-security-policy": "sandbox allow-same-origin; default-src 'none'" } });
    if (path.startsWith("/assets/")) {
      const name = path.slice(8);
      if (name === "client.js") await Bun.sleep(500);
      const file = Bun.file(new URL(name, assets));
      return new Response(file, { headers: { "content-type": name.endsWith(".css") ? "text/css" : "text/javascript" } });
    }
    return new Response("", { status: 404 });
  } });
  const browser = await playwright.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    const base = `http://localhost:${server.port}`;
    await page.goto(base);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value: string) => localStorage.setItem("visual-companion-theme", value), theme);
      // Hold CSS back until the parser-blocking theme script has run.
      let early: string | null = null;
      await page.route("**/assets/components.css", async (route: any) => {
        await page.waitForFunction((value: string) => document.documentElement.getAttribute("data-vc-theme") === value, theme);
        early = await page.evaluate(() => document.documentElement.getAttribute("data-vc-theme"));
        await route.continue();
      });
      await page.reload();
      await page.unroute("**/assets/components.css");
      expect(early).toBe(theme);
      const colors = await page.locator("select[data-vc-theme-select]").evaluate((el: HTMLElement) => {
        const style = getComputedStyle(el);
        return [style.borderTopColor, style.backgroundColor];
      });
      const luminance = (color: string) => {
        const rgb = color.match(/\d+/g)!.slice(0, 3).map(Number).map((v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const [a, b] = colors.map(luminance);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(3);
      expect(await page.frameLocator("iframe").locator("html").getAttribute("data-vc-theme")).toBeNull();
    }
  } finally { await browser.close(); server.stop(true); }
});
