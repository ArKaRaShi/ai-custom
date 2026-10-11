import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALLOWED_EDGES, checkLayers } from "../scripts/layer-guard";

type Layer = "domain" | "interfaces" | "services" | "use-cases" | "infrastructure" | "presentation";
type Kind = "runtime" | "type-only";
const layers: Layer[] = ["domain", "interfaces", "services", "use-cases", "infrastructure", "presentation"];
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function layerPath(layer: Layer, name: string): string {
  if (layer === "interfaces" || layer === "services" || layer === "use-cases") return `scripts/application/${layer}/${name}.ts`;
  return `scripts/${layer}/${name}.ts`;
}
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "layer-guard-")); roots.push(root);
  for (const [path, source] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, source);
  }
  return join(root, "scripts");
}
function edgeFixture(files: Record<string, string>): string {
  const shaped: Record<string, string> = {};
  for (const [path, source] of Object.entries(files)) {
    const isUseCase = path.includes("application/use-cases/");
    shaped[path] = isUseCase && !/\bclass\b/.test(source) ? `${source}\nexport class Shape { execute(): void {} }` : source;
  }
  return fixture(shaped);
}
function from(kind: Kind, specifier: string): string {
  return kind === "type-only" ? `import type { Value } from "${specifier}";` : `import { Value } from "${specifier}";`;
}
function relativeLayerPath(source: Layer, target: Layer, filename = "b"): string {
  const sourceParts = layerPath(source, "a").split("/").slice(0, -1);
  const targetParts = layerPath(target, filename).split("/");
  let common = 0;
  while (common < sourceParts.length && sourceParts[common] === targetParts[common]) common++;
  return `${"../".repeat(sourceParts.length - common)}${targetParts.slice(common).join("/").replace(/\.ts$/, "")}`;
}

describe("given all layers, when checking cross-layer imports, then the edge table is enforced", () => {
  for (const source of layers) for (const target of layers) {
    if (source === target) continue;
    for (const kind of ["runtime", "type-only"] as const) it(`${source} to ${target} ${kind}`, () => {
      const specifier = relativeLayerPath(source, target);
      const scripts = edgeFixture({ [layerPath(source, "a")]: from(kind, specifier), [layerPath(target, "b")]: "export type Value = string;" });
      const allowed = ALLOWED_EDGES[source][target];
      const violations = checkLayers(scripts);
      if (allowed?.includes(kind)) expect(violations).toEqual([]);
      else expect(violations.filter(v => v.rule === "layer-edge" || v.rule === "import-kind")).toHaveLength(1);
      if (!allowed) expect(violations[0]?.rule).toBe("layer-edge");
      else if (!allowed.includes(kind)) expect(violations[0]?.rule).toBe("import-kind");
    });
  }
  it("allows same-layer imports except runtime imports between use cases", () => {
    for (const layer of layers.filter(value => value !== "use-cases")) {
      expect(checkLayers(edgeFixture({ [layerPath(layer, "a")]: from("runtime", "./b"), [layerPath(layer, "b")]: "export type Value = string;" }))).toHaveLength(0);
    }
    expect(checkLayers(edgeFixture({ [layerPath("use-cases", "a")]: from("type-only", "./b"), [layerPath("use-cases", "b")]: "export class B { execute(): void {} }" }))).toHaveLength(0);
    expect(checkLayers(edgeFixture({ [layerPath("use-cases", "a")]: from("runtime", "./b"), [layerPath("use-cases", "b")]: "export class B { execute(): void {} }" }))).toContainEqual(expect.objectContaining({ rule: "import-kind" }));
  });
  it("allows cli.ts imports from every layer and kind", () => {
    for (const target of layers) for (const kind of ["runtime", "type-only"] as const) {
      expect(checkLayers(edgeFixture({ "scripts/cli.ts": from(kind, `./${target === "interfaces" || target === "services" || target === "use-cases" ? "application/" : ""}${target}/b`), [layerPath(target, "b")]: "export type Value = string;" }))).toHaveLength(0);
    }
  });
});

describe("given import syntax variants, when scanning, then every literal module reference and kind is found", () => {
  const forms: readonly [string, string, Kind][] = [
    ["import type named", 'import type { A } from "../presentation/b";', "type-only"],
    ["import type default", 'import type A from "../presentation/b";', "type-only"],
    ["import type namespace", 'import type * as A from "../presentation/b";', "type-only"],
    ["inline one type", 'import { type A } from "../presentation/b";', "type-only"],
    ["inline all types multiline and comments", 'import {\n  type A, /* comment between comma and next modifier */\n  type B\n} from "../presentation/b";', "type-only"],
    ["inline mixed multiline and comments", 'import {\n  type A, /* comment between specifiers */\n  b\n} from "../presentation/b";', "runtime"],
    ["export type named", 'export type { A } from "../presentation/b";', "type-only"],
    ["export type star", 'export type * from "../presentation/b";', "type-only"],
    ["export inline type", 'export { type A } from "../presentation/b";', "type-only"],
    ["export star", 'export * from "../presentation/b";', "runtime"],
    ["dynamic import", 'const value = import("../presentation/b");', "runtime"],
    ["require", 'const value = require("../presentation/b");', "runtime"],
  ];
  for (const [name, statement, kind] of forms) it(`detects forbidden ${name}`, () => {
    const scripts = fixture({ [layerPath("domain", "a")]: statement, [layerPath("presentation", "b")]: "export const A = 1;" });
    expect(checkLayers(scripts)).toContainEqual(expect.objectContaining({ rule: "layer-edge" }));
    const allowed = fixture({ [layerPath("interfaces", "a")]: statement.replaceAll("../presentation/b", "../../domain/b"), [layerPath("domain", "b")]: "export const A = 1;" });
    expect(checkLayers(allowed)).toHaveLength(0);
    expect(kind === "runtime" || kind === "type-only").toBe(true);
  });
});

describe("given imports in guarded layers, when they reference I/O or packages, then policy is enforced", () => {
  const forms = [
    'import { A } from "fs";',
    'const value = import("fs");',
    'const value = require("fs");',
    'export { A } from "fs";',
    'import { A } from "node:fs";',
    'import { A } from "fs/promises";',
  ];
  for (const statement of forms) it(`blocks ${statement}`, () => {
    for (const layer of ["domain", "interfaces", "services", "use-cases"] as const) expect(checkLayers(fixture({ [layerPath(layer, "a")]: statement }))).toContainEqual(expect.objectContaining({ rule: "no-io-import" }));
    expect(checkLayers(fixture({ [layerPath("infrastructure", "a")]: statement, "scripts/cli.ts": statement }))).toHaveLength(0);
  });
  it("allows permitted built-ins and blocks third-party packages in inner layers", () => {
    expect(checkLayers(fixture({ [layerPath("domain", "a")]: 'import { join } from "path";' }))).toHaveLength(0);
    expect(checkLayers(fixture({ [layerPath("domain", "a")]: 'import z from "zod";' }))).toContainEqual(expect.objectContaining({ rule: "no-io-import" }));
    expect(checkLayers(fixture({ [layerPath("infrastructure", "a")]: 'import z from "zod";' }))).toHaveLength(0);
  });
  it("blocks presentation fs imports", () => {
    expect(checkLayers(fixture({ [layerPath("presentation", "a")]: 'import fs from "fs";' }))).toContainEqual(expect.objectContaining({ rule: "no-io-import" }));
  });
});

describe("given banned globals, when used in inner layers, then only code tokens fail", () => {
  const globals: readonly [string, string][] = [
    ["process", "process.exitCode;"], ["Bun", "Bun.file('x');"], ["fetch", "fetch('x');"], ["console", "console.log('x');"],
    ["Date.now", "Date.now();"], ["new Date", "new Date();"], ["Math.random", "Math.random();"], ["randomUUID", "randomUUID();"], ["randomBytes", "randomBytes(2);"]
  ];
  for (const [name, code] of globals) it(`rejects ${name} but ignores comments and strings`, () => {
    expect(checkLayers(fixture({ [layerPath("domain", "a")]: code }))).toContainEqual(expect.objectContaining({ rule: "no-banned-global" }));
    expect(checkLayers(fixture({ [layerPath("domain", "a")]: `// ${code}\nconst text = "${code}";` }))).toHaveLength(0);
  });
  it("allows presentation console and process.argv", () => {
    expect(checkLayers(fixture({ [layerPath("presentation", "a")]: "console.log(process.argv);" }))).toHaveLength(0);
  });
});

describe("given use-case files, when checking structure and dependencies, then shape and cycles are reported", () => {
  function shape(source: string): ReturnType<typeof checkLayers> { return checkLayers(fixture({ [layerPath("use-cases", "Do")]: source })); }
  it("requires one exported class and exactly its execute method", () => {
    expect(shape("export class Do { execute(): void {} }")).toHaveLength(0);
    for (const source of ["export class Do {}", "export class Do { execute(): void {} other(): void {} }", "export class A { execute(): void {} } export class B { execute(): void {} }", "export class Do { execute(): void {} protected extra(): void {} }"]) expect(shape(source)).toContainEqual(expect.objectContaining({ rule: "use-case-shape" }));
    expect(shape("export class Do { constructor() {} private extra(): void {} #hidden() {} execute(): void {} }")).toHaveLength(0);
    expect(checkLayers(fixture({ [layerPath("use-cases", "types")]: "export type A = string;" }))).toHaveLength(0);
    expect(checkLayers(fixture({ [layerPath("use-cases", "Do.types")]: "export type A = string;" }))).toHaveLength(0);
  });
  it("rejects type-only cycles and permits an acyclic use-case graph", () => {
    expect(checkLayers(fixture({ [layerPath("use-cases", "A")]: "import type { B } from './B'; export class A { execute(): void {} }", [layerPath("use-cases", "B")]: "import type { A } from './A'; export class B { execute(): void {} }" }))).toContainEqual(expect.objectContaining({ rule: "use-case-cycle" }));
    expect(checkLayers(fixture({ [layerPath("use-cases", "Bootstrap")]: "import type { PlanSync } from './PlanSync'; export class Bootstrap { execute(): void {} }", [layerPath("use-cases", "PlanSync")]: "export class PlanSync { execute(): void {} }" }))).toHaveLength(0);
  });
});

describe("given a complete skill, when checking the tree and CLI, then clean and failing outcomes are observable", () => {
  it("accepts a clean skill and ignores flat Tier 0 scripts", () => {
    const scripts = fixture({
      "scripts/flat.ts": 'import fs from "fs";',
      [layerPath("domain", "a")]: "export type A = string;",
      [layerPath("interfaces", "a")]: "import type { A } from '../../domain/a'; export type I = A;",
      [layerPath("services", "a")]: "import type { A } from '../../domain/a'; export class S {}",
      [layerPath("infrastructure", "a")]: 'import fs from "fs";',
    });
    expect(checkLayers(scripts)).toEqual([]);
  });
  it("prints success or a formatted violation with the matching exit code", () => {
    const clean = fixture({ [layerPath("domain", "a")]: "export type A = string;" });
    const bad = fixture({ [layerPath("domain", "a")]: 'import fs from "fs";' });
    const cli = join(import.meta.dir, "../scripts/layer-guard.ts");
    const success = Bun.spawnSync(["bun", cli, clean], { stdout: "pipe", stderr: "pipe" });
    expect(success.exitCode).toBe(0);
    expect(`${success.stdout}${success.stderr}`).toContain("✔ layers ok");
    const failure = Bun.spawnSync(["bun", cli, bad], { stdout: "pipe", stderr: "pipe" });
    expect(failure.exitCode).toBe(1);
    expect(`${failure.stdout}${failure.stderr}`).toMatch(/✖ .*:\d+ no-io-import: /);
  });
});


describe("given the published matrix, when ALLOWED_EDGES changes, then a pinned copy fails", () => {
  it("matches the documented edges exactly", () => {
    const BOTH = ["runtime", "type-only"];
    expect(JSON.parse(JSON.stringify(ALLOWED_EDGES))).toEqual({
      domain: {},
      interfaces: { domain: BOTH },
      services: { domain: BOTH, interfaces: BOTH },
      "use-cases": { domain: BOTH, interfaces: BOTH, services: BOTH, "use-cases": ["type-only"] },
      infrastructure: { domain: BOTH, interfaces: BOTH },
      presentation: { domain: BOTH, "use-cases": ["type-only"] },
    });
  });
});

describe("given inline type modifiers, when every specifier is a type, then the import is type-only", () => {
  const consumer = (source: string): string => edgeFixture({
    [layerPath("presentation", "a")]: source,
    [layerPath("use-cases", "b")]: "export type Value = string;",
  });
  it("accepts all-inline-type braces and rejects mixed braces from presentation to use-cases", () => {
    const specifier = relativeLayerPath("presentation", "use-cases");
    expect(checkLayers(consumer(`import { type Value } from "${specifier}";`))).toEqual([]);
    expect(checkLayers(consumer(`import {\n  type Value, // note\n  type Other,\n} from "${specifier}";`))).toEqual([]);
    expect(checkLayers(consumer(`export { type Value } from "${specifier}";`))).toEqual([]);
    expect(checkLayers(consumer(`import { type Value, value } from "${specifier}";`)).map((v) => v.rule)).toEqual(["import-kind"]);
  });
});

describe("given template literals, when checking banned globals, then only interpolations count", () => {
  it("flags a global inside ${} but not inside literal text", () => {
    const run = (source: string) => checkLayers(fixture({ [layerPath("domain", "a")]: source }));
    expect(run("export const a = `value ${process.cwd()}`;").map((v) => v.rule)).toEqual(["no-banned-global"]);
    expect(run("export const a = `process fetch console`;")).toEqual([]);
    expect(run("export const a = `x ${`${Date.now()}`}`;").map((v) => v.rule)).toEqual(["no-banned-global"]);
  });
});

describe("given qualified entropy calls, when they appear in pure layers, then they are banned", () => {
  const run = (layer: Layer, source: string) => checkLayers(fixture({ [layerPath(layer, "a")]: source }));
  it("flags crypto.randomUUID and crypto.randomBytes in domain and services but not infrastructure or presentation", () => {
    for (const call of ["crypto.randomUUID()", "crypto.randomBytes(8)"]) {
      for (const layer of ["domain", "services"] as const) {
        expect(run(layer, `import crypto from "crypto";\nexport const x = ${call};`).map((v) => v.rule)).toEqual(["no-banned-global"]);
      }
      expect(run("infrastructure", `import crypto from "crypto";\nexport const x = ${call};`)).toEqual([]);
      expect(run("presentation", `import crypto from "crypto";\nexport const x = ${call};`)).toEqual([]);
    }
  });
  it("still allows hashing with crypto in domain", () => {
    expect(run("domain", `import { createHash } from "crypto";\nexport const x = createHash("sha256");`)).toEqual([]);
  });
});
