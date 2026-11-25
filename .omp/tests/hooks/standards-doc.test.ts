#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import standardsDoc from "../../hooks/pre/standards-doc";

type Handler = (event: unknown, ctx: unknown) => unknown;

const VALID = `# Probe

Applies to probe files, to prove the shape gate works end to end.

## Rule

Keep the probe short.

## Enforced by

| Harness | Adapter | Category |
| --- | --- | --- |
| omp | — | — |
`;

function mount(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const stub = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, handler);
    },
  };
  standardsDoc(stub);
  return handlers;
}

function tempStandard(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "standard-"));
  const folder = path.join(dir, ".agents/standards");
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, "probe.md");
  fs.writeFileSync(file, content);
  return file;
}

describe("given the standards shape gate, when a standard is written or edited, then the template holds", () => {
  it("blocks a write that has no enforcement table and names the fix", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const verdict = await call?.({ toolName: "write", input: { path: "/tmp/.agents/standards/probe.md", content: "# Probe\n\nApplies to probe files only.\n\n## Rule\n\nKeep it short.\n\n## Also\n\nKeep it stable.\n" } }, {});
    expect(verdict).toMatchObject({ block: true });
    expect(JSON.stringify(verdict)).toContain("enforced");
    expect(JSON.stringify(verdict)).toContain("Fix:");
  });

  it("allows a write that matches the template", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const verdict = await call?.({ toolName: "write", input: { path: "/tmp/.agents/standards/probe.md", content: VALID } }, {});
    expect(verdict).toBeUndefined();
  });

  it("ignores README.md, which is the catalog", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const verdict = await call?.({ toolName: "write", input: { path: "/tmp/.agents/standards/README.md", content: "# Catalog\n" } }, {});
    expect(verdict).toBeUndefined();
  });

  it("warns once after an edit leaves the file broken", async () => {
    const handlers = mount();
    const file = tempStandard("# Probe\n\nNow broken.\n");
    const call = handlers.get("tool_result");
    const first = await call?.({ toolName: "edit", isError: false, input: { path: file } }, {});
    const second = await call?.({ toolName: "edit", isError: false, input: { path: file } }, {});
    expect(first).toMatchObject({ additionalContext: expect.stringContaining("no longer matches") });
    expect(second).toBeUndefined();
    fs.rmSync(path.dirname(path.dirname(path.dirname(file))), { recursive: true, force: true });
  });

  it("stays quiet when the edited file is valid or the edit failed", async () => {
    const handlers = mount();
    const file = tempStandard(VALID);
    const call = handlers.get("tool_result");
    const valid = await call?.({ toolName: "edit", isError: false, input: { path: file } }, {});
    const failed = await call?.({ toolName: "edit", isError: true, input: { path: file } }, {});
    expect(valid).toBeUndefined();
    expect(failed).toBeUndefined();
    fs.rmSync(path.dirname(path.dirname(path.dirname(file))), { recursive: true, force: true });
  });
});
