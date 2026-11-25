#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import imageWork, { HOOK_META } from "../../hooks/pre/image-work";

type Handler = (event: unknown, ctx: unknown) => unknown;

function mount(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const stub = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, handler);
    },
  };
  imageWork(stub);
  return handlers;
}

function readPayload(file: string): { toolName: string; input: { path: string } } {
  return { toolName: "read", input: { path: file } };
}

describe("given the image-work hook, when an agent touches an image, then the past mistakes are caught", () => {
  it("blocks the raster selector that really errored in the transcripts", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const payload = readPayload("/tmp/local-auto-report-verify.png:img");
    const verdict = await call?.(payload, {});
    const refusal = verdict as { block?: boolean; reason?: string };
    expect(refusal.block).toBe(true);
    expect(String(refusal.reason)).toContain("rejects the img selector");
    expect(String(refusal.reason)).toContain('Fix: read "/tmp/local-auto-report-verify.png"');
  });

  it("points at the standard once, on the first image tool call", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const payload = readPayload("/tmp/ref/ours/eq-review-p1.png");
    const first = await call?.(payload, {});
    const second = await call?.({ toolName: "eval", input: { code: "from PIL import Image" } }, {});
    expect(first).toMatchObject({ additionalContext: expect.stringContaining("working-with-image.md") });
    expect(second).toBeUndefined();
  });

  it("leaves a repeated read alone, because the harness can return the image again", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const payload = readPayload("/tmp/ref/ours/eq-review-p1.png");
    await call?.(payload, {});
    expect(await call?.(payload, {})).toBeUndefined();
  });

  it("catches screenshots taken through bash", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const verdict = await call?.({ toolName: "bash", input: { command: "sips -g pixelWidth shot.png" } }, {});
    expect(verdict).toMatchObject({ additionalContext: expect.stringContaining("working-with-image.md") });
  });

  it("keeps the pointer for a failed read, where the path is the mistake", async () => {
    const handlers = mount();
    const result = handlers.get("tool_result");
    const verdict = await result?.({ toolName: "read", isError: true, input: { path: "/tmp/omp-closejob-mock.png" } }, {});
    expect(verdict).toMatchObject({ additionalContext: expect.stringContaining("could not be read") });
  });

  it("ignores text files", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const textRead = readPayload("src/app.ts");
    expect(await call?.(textRead, {})).toBeUndefined();
    expect(await call?.({ toolName: "bash", input: { command: "ls -la" } }, {})).toBeUndefined();
  });

  it("re-arms the pointer after a session reset", async () => {
    const handlers = mount();
    const call = handlers.get("tool_call");
    const payload = readPayload("/tmp/a.png");
    await call?.(payload, {});
    handlers.get("session_start")?.({}, {});
    const again = await call?.(payload, {});
    expect(again).toMatchObject({ additionalContext: expect.stringContaining("working-with-image.md") });
  });

  it("declares the image standard", () => {
    expect(HOOK_META.standards).toEqual([".agents/standards/working-with-image.md"]);
  });
});
