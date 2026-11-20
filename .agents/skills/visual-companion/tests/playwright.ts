import type * as Playwright from "playwright";

// Playwright is optional and installed with the Explain renderer's development dependencies.
let playwright: typeof Playwright | undefined;
try {
  const manifest = new URL("../explain/package.json", import.meta.url);
  const entry = import.meta.resolve("playwright", manifest.pathname);
  playwright = await import(entry);
} catch {
  playwright = undefined;
}
export { playwright };
