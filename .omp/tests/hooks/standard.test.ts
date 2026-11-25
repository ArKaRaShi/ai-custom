#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { checkHookMeta, type HookMeta } from "../../hooks/shared/verdict";

const HOOKS_DIR = path.resolve(import.meta.dir, "../../hooks");

interface HookModule {
  HOOK_META?: HookMeta;
  default?: (pi: unknown) => void;
}

function hookFiles(): string[] {
  return ["pre", "post"].flatMap((kind) =>
    fs
      .readdirSync(path.join(HOOKS_DIR, kind))
      .filter((name) => name.endsWith(".ts") && !name.startsWith("."))
      .map((name) => path.join(HOOKS_DIR, kind, name)),
  );
}

async function load(file: string): Promise<HookModule> {
  const url = pathToFileURL(file);
  return import(url.href);
}

describe("given the shared hook standard, when scanning hooks, then every hook declares the same contract", () => {
  it("declares HOOK_META with a known category, a kebab-case id, and at least one event", async () => {
    for (const file of hookFiles()) {
      const meta = (await load(file)).HOOK_META;
      const problems = meta ? checkHookMeta(meta) : ["HOOK_META is missing"];
      expect({ file, problems }).toEqual({ file, problems: [] });
    }
  });

  it("wires exactly the events that HOOK_META declares", async () => {
    for (const file of hookFiles()) {
      const mod = await load(file);
      const meta = mod.HOOK_META;
      const factory = mod.default;
      if (!meta || !factory) continue;
      const registered = new Set<string>();
      const stub = {
        on: (event: string) => {
          registered.add(event);
        },
        exec: async () => ({ code: 0, killed: false, stdout: "", stderr: "" }),
      };
      factory(stub);
      expect({ file, wired: [...registered].sort() }).toEqual({ file, wired: [...meta.events].sort() });
    }
  });

  it("points only at standard docs that exist in the repo", async () => {
    for (const file of hookFiles()) {
      const meta = (await load(file)).HOOK_META;
      if (!meta) continue;
      const real = fs.realpathSync(file);
      const root = path.resolve(path.dirname(real), "../../..");
      for (const doc of meta.standards) {
        expect({ file, doc, exists: fs.existsSync(path.join(root, doc)) }).toEqual({ file, doc, exists: true });
      }
    }
  });

  it("uses the shared builders instead of hand-built blocking returns", () => {
    for (const file of hookFiles()) {
      const source = fs.readFileSync(file, "utf8");
      expect({ file, rawBlock: /block\s*:\s*true/.test(source) }).toEqual({ file, rawBlock: false });
    }
  });

  it("uses a unique id per hook", async () => {
    const ids: string[] = [];
    for (const file of hookFiles()) {
      const meta = (await load(file)).HOOK_META;
      if (meta) ids.push(meta.id);
    }
    expect(ids.length).toBe(new Set(ids).size);
  });
});
