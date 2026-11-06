import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

interface Page {
  setContent(html: string): Promise<void>;
  addStyleTag(options: { content: string }): Promise<void>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
}
interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}
interface Playwright {
  chromium: { launch(options: { executablePath: string; headless: boolean }): Promise<Browser> };
}

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let playwright: Playwright | undefined;
try { playwright = require("playwright") as Playwright; } catch {}
const cssUrl = new URL("../assets/components.css", import.meta.url);
const css = readFileSync(cssUrl, "utf8");

const hasChrome = existsSync(chrome);
const skipBrowser = !playwright || !hasChrome;
const browserTest = test.skipIf(skipBrowser);
browserTest("stat grids wrap by container width without overflowing", async () => {
  const browser = await playwright!.chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    const html = '<div class="vc-grid" style="--vc-cols:4">' + '<div class="vc-stat">42</div>'.repeat(4) + '</div>';
    await page.setContent(html);
    await page.addStyleTag({ content: css });
    const bands: Array<[number, number]> = [[676, 4], [675, 3], [504, 3], [503, 2], [332, 2], [331, 1], [120, 1]];
    for (const [width, columns] of bands) {
      const result = await page.evaluate((containerWidth: number) => {
        const grid = document.querySelector<HTMLElement>(".vc-grid")!;
        grid.style.width = `${containerWidth}px`;
        const cells = Array.from(grid.children);
        const top = cells[0].getBoundingClientRect().top;
        const firstRow = cells.filter((cell) => cell.getBoundingClientRect().top === top);
        return { columns: firstRow.length, scrollWidth: grid.scrollWidth, width: grid.clientWidth };
      }, width);
      expect(result.columns).toBe(columns);
      expect(result.scrollWidth).toBeLessThanOrEqual(result.width);
    }
  } finally {
    await browser.close();
  }
});
