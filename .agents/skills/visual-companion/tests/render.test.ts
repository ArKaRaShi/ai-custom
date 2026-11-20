import { expect, test } from "bun:test";
import { composePage, emptyState, renderScreen, withClient } from "../scripts/render";

const CLIENT = '<script src="/assets/client.js" defer></script>';
const plain = '<!doctype html><html><body><p>mine</p></body></html>';

test("plain documents retain their content and gain the event client", () => {
  expect(withClient(plain, { scripts: true })).toBe(plain.replace("</body>", `${CLIENT}\n</body>`));
  expect(withClient(plain, { scripts: false })).toBe(plain);
});

test("isolated fragments render without executable companion controls", async () => {
  const result = await renderScreen({ mode: "bundle", title: "Preview", content: "<p>Example</p>", isolated: true });
  expect(result).toContain("<p>Example</p>");
  expect(result).not.toContain("<script");
});

test("the empty screen shows a waiting message", async () => {
  expect(await emptyState()).toContain("Waiting for a screen");
});

test("a page links named sections and escapes their titles", () => {
  const html = composePage([{ name: "Answer", html: "<p>a</p>" }, { name: "Why <it>", html: "<p>b</p>" }]);
  expect(html).toContain('href="#part-2"');
  expect(html).toContain('<section id="part-2"><h2>Why &lt;it&gt;</h2><p>b</p></section>');
});
