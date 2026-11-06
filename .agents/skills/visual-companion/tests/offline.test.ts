/*
 * "Component behavior makes no network requests" is a claim in references/components.md.
 * This turns it into a check: the modules and the stylesheet contain nothing that could
 * reach the network, and only one module is a way in.
 */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./css";

const ASSETS = join(import.meta.dir, "..", "assets");
const MODULES = join(ASSETS, "components");
const elementFiles = readdirSync(MODULES).filter((name) => name.endsWith(".js"));
const layoutDir = join(MODULES, "layout");
const layoutEntries = readdirSync(layoutDir);
const layoutFiles = layoutEntries.map((name) => `layout/${name}`);
const moduleFiles = [...elementFiles, ...layoutFiles];

function stripJsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const code = (file: string): string => stripJsComments(readFileSync(join(MODULES, file), "utf8"));

test("the component modules are plain .js files, one of which is index.js", () => {
  expect(moduleFiles.length).toBeGreaterThan(1);
  expect(moduleFiles).toContain("index.js");
  expect(readdirSync(MODULES).filter((name) => !name.endsWith(".js"))).toEqual(["layout"]);
});

test("no module can reach the network", () => {
  const forbidden = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|\bimport\s*\(|https?:\/\//;
  // The SVG namespace is an identifier passed to createElementNS, not a request.
  const hits = moduleFiles.filter((file) => {
    const source = code(file);
    const withoutNamespace = source.replaceAll('"http://www.w3.org/2000/svg"', '""');
    return forbidden.test(withoutNamespace);
  });
  expect(hits).toEqual([]);
});

test("components.css has no @import and no url()", () => {
  const css = stripComments(readFileSync(join(ASSETS, "components.css"), "utf8"));
  expect(css).not.toMatch(/@import/);
  expect(css).not.toMatch(/url\s*\(/);
});

test("importing a module only needs HTMLElement: nothing runs at import time except index.js, guarded", () => {
  for (const file of moduleFiles) {
    const body = code(file);
    if (file === "index.js") {
      expect(body).toContain('typeof customElements !== "undefined"');
      expect(body).toContain('typeof document !== "undefined"');
    } else {
      expect(body, `${file} must not touch document or window at import time`).not.toMatch(/^(?:document|window|customElements)\b/m);
    }
  }
});

test("module boundary: elements import core or layout; layout imports only layout", () => {
  const imports = (file: string): string[] => [...code(file).matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1] ?? "");
  for (const file of elementFiles) {
    if (file === "index.js") continue;
    const invalid = imports(file).filter((name) => name !== "./core.js" && !/^\.\/layout\/[\w.-]+\.js$/.test(name));
    expect(invalid, file).toEqual([]);
  }
  expect(imports("core.js")).toEqual([]);
  for (const file of layoutFiles) {
    const invalid = imports(file).filter((name) => !/^\.\/[\w.-]+\.js$/.test(name));
    expect(invalid, file).toEqual([]);
  }

  const outside = [
    readFileSync(join(ASSETS, "frame.html"), "utf8"),
    ...readdirSync(join(import.meta.dir, "..", "scripts"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(join(import.meta.dir, "..", "scripts", name), "utf8")),
  ].join("\n");
  const referenced = [...outside.matchAll(/assets\/components\/([\w./-]+\.js)/g)].map((m) => m[1]);
  expect(referenced.length).toBeGreaterThan(0);
  const allowed = ["index.js", "layout/kinds.js"];
  const unexpected = referenced.filter((name) => !allowed.includes(name!));
  expect(unexpected).toEqual([]);
});
