/*
 * Import first. ES modules evaluate `class X extends HTMLElement` at import time,
 * so the fakes must be global before assets/components/ loads. No global
 * `customElements` is set: index.js then skips registration and tests use ELEMENTS.
 */
import { FakeElement, FakeEvent, type FakeDom } from "./dom";

Object.assign(globalThis, { HTMLElement: FakeElement, CustomEvent: FakeEvent });

export function installDocument(doc: FakeDom["document"]): void {
  Object.assign(globalThis, { document: doc });
}

export function removeDocument(): void {
  Reflect.deleteProperty(globalThis, "document");
}

/** Custom elements know their own tag name; the fake base class needs it explicitly. */
export function instantiate<T extends FakeElement = FakeElement>(registry: Record<string, unknown>, name: string): T {
  const Base = registry[name] as new (tag: string) => T;
  return new (class extends Base {
    constructor() {
      super(name);
    }
  })();
}
