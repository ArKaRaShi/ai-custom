import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ThaiStore } from "@/scripts/application/interfaces/thai-store";
import { FsReviewFiles } from "@/scripts/infrastructure/fs-review-files";
import { JsonThaiStore } from "@/scripts/infrastructure/json-thai-store";
import { InMemoryStore } from "./fixtures";

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

function jsonStore(): { store: ThaiStore; file: string } {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "svr-store-"));
  folders.push(folder);
  const file = path.join(folder, "nested", "thai.json");
  return { store: new JsonThaiStore(new FsReviewFiles(), file), file };
}

const IMPLEMENTATIONS: Array<[string, () => { store: ThaiStore; file?: string }]> = [
  ["in-memory fake", () => ({ store: new InMemoryStore() })],
  ["JSON file adapter", jsonStore],
];

for (const [name, make] of IMPLEMENTATIONS) {
  describe(`ThaiStore contract: ${name}`, () => {
    it("starts empty", async () => {
      const records = await make().store.load();
      expect(records).toEqual({ model: "", entries: {}, overrides: {} });
    });

    it("returns what was saved, with the model name", async () => {
      const { store } = make();
      await store.save({ k1: { en: "a", th: "ก" } }, "m1");
      expect(await store.load()).toEqual({
        model: "m1",
        entries: { k1: { en: "a", th: "ก" } },
        overrides: {},
      });
    });

    it("replaces entries on every save", async () => {
      const { store } = make();
      await store.save({ k1: { en: "a", th: "ก" } }, "m1");
      await store.save({ k2: { en: "b", th: "ข" } }, "m2");
      const records = await store.load();
      expect(Object.keys(records.entries)).toEqual(["k2"]);
    });
  });
}

describe("JsonThaiStore adapter", () => {
  it("keeps a human override that was typed into the file", async () => {
    const { store, file } = jsonStore();
    await store.save({ k1: { en: "a", th: "ก" } }, "m1");
    const body = JSON.parse(fs.readFileSync(file, "utf8"));
    body.overrides = { k1: { en: "a", th: "แก้" } };
    fs.writeFileSync(file, JSON.stringify(body));
    await store.save({ k1: { en: "a", th: "ใหม่" } }, "m2");
    const records = await store.load();
    expect(records.overrides.k1?.th).toBe("แก้");
    expect(records.entries.k1?.th).toBe("ใหม่");
  });

  it("rejects a malformed file with a named error", async () => {
    const { store, file } = jsonStore();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{not json");
    await expect(store.load()).rejects.toThrow("not valid JSON");
    fs.writeFileSync(file, JSON.stringify({ entries: { k: { en: "a" } } }));
    await expect(store.load()).rejects.toThrow("needs string");
  });

  it("leaves no staging file behind after saving", async () => {
    const { store, file } = jsonStore();
    await store.save({}, "m");
    expect(fs.readdirSync(path.dirname(file))).toEqual(["thai.json"]);
  });
});
