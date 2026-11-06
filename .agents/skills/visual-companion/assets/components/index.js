/*
 * The ONE module a page loads for the behaviour components. frame.html loads it
 * as a module; the plain-document opt-in (data-vc-components) injects the same
 * tag. Everything else is CSS in components.css.
 * No build step, no framework, no network.
 */
import { VcChart } from "./chart.js";
import { VcCause } from "./cause.js";
import { VcCode } from "./code.js";
import { VcContents } from "./contents.js";
import { VcDiagram } from "./diagram.js";
import { VcInspect } from "./inspect.js";
import { VcPredict } from "./predict.js";
import { VcScrub } from "./scrub.js";
import { VcTabs } from "./tabs.js";
import { VcTimebar } from "./timebar.js";
import { VcTerm } from "./term.js";

/* The one element list. `vc-tab` is a passive part of vc-tabs and is not registered. */
export const ELEMENTS = {
  "vc-tabs": VcTabs,
  "vc-scrub": VcScrub,
  "vc-cause": VcCause,
  "vc-timebar": VcTimebar,
  "vc-inspect": VcInspect,
  "vc-chart": VcChart,
  "vc-code": VcCode,
  "vc-contents": VcContents,
  "vc-diagram": VcDiagram,
  "vc-predict": VcPredict,
  "vc-term": VcTerm,
};

/**
 * Defines each element once; names already in the registry are left alone.
 * @param {{ get(name: string): unknown, define(name: string, ctor: CustomElementConstructor): void }} registry
 */
export function register(registry) {
  for (const [name, ctor] of Object.entries(ELEMENTS)) {
    if (!registry.get(name)) registry.define(name, ctor);
  }
}

if (typeof customElements !== "undefined" && typeof document !== "undefined") register(customElements);
