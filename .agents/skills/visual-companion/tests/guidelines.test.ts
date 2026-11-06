/*
 * The web-interface guidelines components.css has to keep, as checks on the stylesheet text.
 * No browser runs here, so each guideline is stated as a structural property of the rules:
 *
 *   - no `transition: all`, and transitions name only paint properties (never layout)
 *   - motion is scoped to prefers-reduced-motion: no-preference, or neutralised under reduce
 *   - outline is never removed without a :focus-visible replacement in the same layer
 *   - :root declares color-scheme: light dark, and the two theme pins declare their own scheme
 *   - tap targets declare touch-action: manipulation
 *   - headings use text-wrap: balance and prose uses text-wrap: pretty
 *   - the frame's theme-color metas equal the literal --vc-bg of each palette
 *
 * tests/css.ts reads rules without their at-rule context, which these checks need, so this file
 * reads the context itself. It shares the rule that components.css stays flat (scope.test.ts):
 * a nested block throws instead of being misread. Every check is a function over parsed rules,
 * so the last tests can break the real stylesheet in memory and show each check notices.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { stripComments } from "./css";

function asset(name: string): string {
  const url = new URL(`../assets/${name}`, import.meta.url);
  return readFileSync(url, "utf8");
}

const source = asset("components.css");
const frame = asset("frame.html");
const scrubScript = asset("components/scrub.js");

/* ---------------------------------- reading ---------------------------------- */

interface Declaration {
  readonly property: string;
  readonly value: string;
  readonly important: boolean;
}

interface StyleRule {
  readonly selector: string;
  readonly declarations: readonly Declaration[];
  /** `vc.components`...; null outside every layer. */
  readonly layer: string | null;
  /** Enclosing @media / @supports / @container preludes, outermost first. */
  readonly conditions: readonly string[];
  /** The @keyframes name when this is a step such as `from` or `50%`. */
  readonly keyframes: string | null;
  /** Source position, to compare which of two rules comes later. */
  readonly order: number;
}

interface Block {
  readonly kind: "layer" | "keyframes" | "condition";
  readonly name: string;
}

/** `text` split on `separator` where it sits outside parentheses, brackets and quotes. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "]") {
      depth--;
    } else if (ch === separator && depth === 0) {
      const part = current.trim();
      if (part) parts.push(part);
      current = "";
      continue;
    }
    current += ch;
  }
  const last = current.trim();
  if (last) parts.push(last);
  return parts;
}

/** Index of the bracket that closes the one at `open`, skipping quoted text; -1 when unclosed. */
function closingIndex(text: string, open: number, opener: string, closer: string): number {
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === opener) {
      depth++;
    } else if (ch === closer && --depth === 0) {
      return i;
    }
  }
  return -1;
}

function blockOf(head: string): Block {
  const keyframes = /^@(?:-\w+-)?keyframes\s+(.+)$/i.exec(head);
  if (keyframes) return { kind: "keyframes", name: keyframes[1] ?? "" };
  if (/^@layer\b/i.test(head)) return { kind: "layer", name: head.slice(6).trim() };
  return { kind: "condition", name: head.replace(/\s+/g, " ") };
}

function parseDeclarations(body: string): Declaration[] {
  const declarations: Declaration[] = [];
  for (const part of splitTop(body, ";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim();
    const raw = part.slice(colon + 1).trim();
    const property = name.startsWith("--") ? name : name.toLowerCase();
    const value = raw.replace(/\s*!\s*important\s*$/i, "").trim();
    declarations.push({ property, value, important: /!\s*important\s*$/i.test(raw) });
  }
  return declarations;
}

function parseStyleRules(css: string): StyleRule[] {
  const text = stripComments(css);
  const found: StyleRule[] = [];
  const blocks: Block[] = [];
  let prelude = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ";") {
      prelude = "";
    } else if (ch === "}") {
      blocks.pop();
      prelude = "";
    } else if (ch === "{") {
      const head = prelude.trim();
      prelude = "";
      if (head.startsWith("@")) {
        const block = blockOf(head);
        blocks.push(block);
        continue;
      }
      const close = closingIndex(text, i, "{", "}");
      if (close < 0) throw new Error(`unterminated block after "${head}"`);
      const body = text.slice(i + 1, close);
      if (body.includes("{")) throw new Error(`nested block inside "${head}": the stylesheet must stay flat`);
      const layers = blocks.filter((block) => block.kind === "layer").map((block) => block.name);
      const conditions = blocks.filter((block) => block.kind === "condition").map((block) => block.name);
      const keyframes = blocks.findLast((block) => block.kind === "keyframes")?.name ?? null;
      const declarations = parseDeclarations(body);
      found.push({ selector: head, declarations, layer: layers.length > 0 ? layers.join(".") : null, conditions, keyframes, order: found.length });
      i = close;
    } else {
      prelude += ch;
    }
  }
  return found;
}

/** Expands every `:is()` / `:where()` into plain selectors, so `.a :is(b, c)` becomes `.a b` and `.a c`. */
function expandSelector(selector: string): string[] {
  const match = /:(?:is|where)\(/.exec(selector);
  if (!match) return [selector.trim()];
  const open = match.index + match[0].length - 1;
  const close = closingIndex(selector, open, "(", ")");
  if (close < 0) return [selector.trim()];
  const before = selector.slice(0, match.index);
  const after = selector.slice(close + 1);
  const inner = selector.slice(open + 1, close);
  return splitTop(inner, ",").flatMap((alternative) => expandSelector(before + alternative + after));
}

function selectorParts(rule: StyleRule): string[] {
  return splitTop(rule.selector, ",").flatMap(expandSelector);
}

/** The compound a selector styles: everything after its last combinator. */
function subject(selector: string): string {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && (ch === " " || ch === ">" || ch === "+" || ch === "~")) cut = i;
  }
  return selector.slice(cut + 1).trim();
}

const PSEUDO_ELEMENT = /::[a-z-]+(?:\([^)]*\))?$/i;

/** A selector with attribute filters and spacing removed: what two spellings of one target share. */
function shape(selector: string): string {
  return selector.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

/** A readable label for a failure message. */
function where(rule: StyleRule): string {
  const layer = rule.layer ?? "unlayered";
  const selector = rule.selector.replace(/\s+/g, " ");
  return `${layer} | ${selector}`;
}

/** The last value `property` gets from an unconditional rule listing exactly `selector`. */
function lastDeclared(all: readonly StyleRule[], selector: string, property: string): string | undefined {
  let value: string | undefined;
  for (const rule of all) {
    if (rule.keyframes || rule.conditions.length > 0) continue;
    const listed = splitTop(rule.selector, ",").some((part) => part.replace(/\s+/g, " ") === selector);
    if (!listed) continue;
    for (const declaration of rule.declarations) if (declaration.property === property) value = declaration.value;
  }
  return value;
}

/* ---------------------------------- transitions ---------------------------------- */

const PAINT_PROPERTIES: Record<string, true> = {
  transform: true,
  opacity: true,
  color: true,
  "background-color": true,
  "border-color": true,
  "box-shadow": true,
  "outline-color": true,
  fill: true,
  stroke: true,
};

const GLOBAL_KEYWORDS: Record<string, true> = { inherit: true, initial: true, unset: true, revert: true, "revert-layer": true };

const TIME = /^-?(?:\d+\.?\d*|\.\d+)m?s$/i;
const TIMING = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|(?:cubic-bezier|steps|linear)\(.*\))$/i;

interface TransitionUse {
  readonly rule: string;
  /** `all` also stands for a transition that names no property, which transitions everything. */
  readonly property: string;
}

function transitionUses(all: readonly StyleRule[]): TransitionUse[] {
  const uses: TransitionUse[] = [];
  const variables = new Map<string, string>();
  for (const rule of all) {
    for (const declaration of rule.declarations) {
      if (declaration.property.startsWith("--")) variables.set(declaration.property, declaration.value);
    }
  }
  for (const rule of all) {
    if (rule.keyframes) continue;
    const label = where(rule);
    for (const declaration of rule.declarations) {
      if (declaration.property === "transition") {
        for (const segment of splitTop(declaration.value, ",")) {
          const spaced = segment.replace(/\s+/g, " ");
          const tokens = splitTop(spaced, " ");
          if (tokens.some((token) => token === "none" || Object.hasOwn(GLOBAL_KEYWORDS, token))) continue;
          const names = tokens.filter((token) => {
            const variable = /^var\(\s*(--[\w-]+)\s*\)$/.exec(token);
            const resolved = variable ? variables.get(variable[1]!) ?? token : token;
            return !TIME.test(resolved) && !TIMING.test(resolved) && token !== "allow-discrete" && token !== "normal";
          });
          const properties = names.length > 0 ? names : ["all"];
          for (const property of properties) uses.push({ rule: label, property: property.toLowerCase() });
        }
      } else if (declaration.property === "transition-property") {
        for (const property of splitTop(declaration.value, ",")) {
          if (property !== "none" && !Object.hasOwn(GLOBAL_KEYWORDS, property)) uses.push({ rule: label, property: property.toLowerCase() });
        }
      }
    }
  }
  return uses;
}

function findTransitionAll(all: readonly StyleRule[]): string[] {
  return transitionUses(all)
    .filter((use) => use.property === "all")
    .map((use) => `${use.rule}: transitions all`);
}

function findNonPaintTransitions(all: readonly StyleRule[]): string[] {
  return transitionUses(all)
    .filter((use) => use.property !== "all" && !Object.hasOwn(PAINT_PROPERTIES, use.property))
    .map((use) => `${use.rule}: transitions ${use.property}`);
}

function findNonPaintAnimations(all: readonly StyleRule[]): string[] {
  return all.flatMap((rule) => rule.keyframes
    ? rule.declarations
      .filter((declaration) => !Object.hasOwn(PAINT_PROPERTIES, declaration.property) && declaration.property !== "animation-timing-function")
      .map((declaration) => `${where(rule)}: animates ${declaration.property}`)
    : []);
}

/* ---------------------------------- motion scope ---------------------------------- */

type MotionKind = "transition" | "animation" | "scroll";

/** At or below this a duration reads as "no motion": the reduce override uses 0.01ms. */
const INSTANT_MS = 1;

/** The longest of a comma list of times in ms; anything that is not a plain time counts as long. */
function longestMs(value: string): number {
  const durations = splitTop(value, ",").map((item) => {
    const match = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/i.exec(item);
    if (!match) return Number.POSITIVE_INFINITY;
    return Number(match[1]) * (match[2]?.toLowerCase() === "s" ? 1000 : 1);
  });
  return Math.max(0, ...durations);
}

function isNone(value: string): boolean {
  return splitTop(value, ",").every((item) => item === "none");
}

/** What a declaration starts: a transition, an animation, or smooth scrolling. */
function startsMotion(declaration: Declaration): MotionKind | null {
  const { property, value } = declaration;
  if (property === "transition" || property === "transition-property") return isNone(value) ? null : "transition";
  if (property === "transition-duration") return longestMs(value) > INSTANT_MS ? "transition" : null;
  if (property === "animation" || property === "animation-name") return isNone(value) ? null : "animation";
  if (property === "animation-duration") return longestMs(value) > INSTANT_MS ? "animation" : null;
  if (property === "scroll-behavior") return value === "smooth" ? "scroll" : null;
  return null;
}

/** What a declaration switches off, for the reduce override. */
function stopsMotion(declaration: Declaration): MotionKind | null {
  const { property, value } = declaration;
  if (property === "transition" || property === "transition-property") return isNone(value) ? "transition" : null;
  if (property === "transition-duration") return longestMs(value) <= INSTANT_MS ? "transition" : null;
  if (property === "animation" || property === "animation-name") return isNone(value) ? "animation" : null;
  if (property === "animation-duration") return longestMs(value) <= INSTANT_MS ? "animation" : null;
  if (property === "scroll-behavior") return value === "auto" ? "scroll" : null;
  return null;
}

function motionPreference(conditions: readonly string[]): "no-preference" | "reduce" | null {
  for (const condition of conditions) {
    if (/\bnot\b/i.test(condition)) continue;
    if (/prefers-reduced-motion\s*:\s*no-preference/i.test(condition)) return "no-preference";
    if (/prefers-reduced-motion\s*:\s*reduce/i.test(condition)) return "reduce";
  }
  return null;
}

/** Whether a reduce-motion selector reaches the element a motion rule styles. */
function reaches(reduceSelector: string, target: string): boolean {
  if (shape(reduceSelector) === shape(target)) return true;
  const reducePseudo = PSEUDO_ELEMENT.exec(reduceSelector)?.[0] ?? "";
  const targetPseudo = PSEUDO_ELEMENT.exec(target)?.[0] ?? "";
  if (reducePseudo !== targetPseudo) return false;
  const base = reduceSelector.replace(PSEUDO_ELEMENT, "");
  const targetBase = target.replace(PSEUDO_ELEMENT, "");
  const styled = subject(targetBase);
  if (base === '[class^="vc-"]' || base === '[class*=" vc-"]') {
    const withoutAttributes = styled.replace(/\[[^\]]*\]/g, "");
    return [...withoutAttributes.matchAll(/\.(vc-[\w-]*)/g)].length > 0;
  }
  return /^vc-[a-z-]+$/.test(base) && new RegExp(`^${base}(?![\\w-])`).test(styled);
}

/**
 * A reduce override beats a motion rule when it is !important, or when it names the very same
 * target later in the same layer. A bare duration of 0.01ms on a blanket selector loses to any
 * rule with higher specificity, so it does not count.
 */
function isNeutralised(rule: StyleRule, kind: MotionKind, target: string, reducers: readonly StyleRule[]): boolean {
  return reducers.some((reducer) =>
    reducer.declarations.some((declaration) => {
      if (stopsMotion(declaration) !== kind) return false;
      return selectorParts(reducer).some((candidate) => {
        if (!reaches(candidate, target)) return false;
        const sameTarget = shape(candidate) === shape(target);
        return declaration.important || (sameTarget && reducer.layer === rule.layer && reducer.order > rule.order);
      });
    }),
  );
}

function findUnscopedMotion(all: readonly StyleRule[]): string[] {
  const reducers = all.filter((rule) => !rule.keyframes && motionPreference(rule.conditions) === "reduce");
  const problems: string[] = [];
  for (const rule of all) {
    if (rule.keyframes) continue;
    const preference = motionPreference(rule.conditions);
    if (preference === "no-preference") continue;
    const label = where(rule);
    for (const declaration of rule.declarations) {
      const kind = startsMotion(declaration);
      if (!kind) continue;
      if (preference === "reduce") {
        problems.push(`${label}: ${declaration.property} moves under prefers-reduced-motion: reduce`);
      } else if (!selectorParts(rule).every((target) => isNeutralised(rule, kind, target, reducers))) {
        problems.push(`${label}: ${declaration.property} is neither under no-preference nor neutralised under reduce`);
      }
    }
  }
  return problems;
}

/* ---------------------------------- focus outline ---------------------------------- */

const ZERO_LENGTH = /^0(?:px|em|rem)?$/;
const FOCUS_STATE = /:focus-visible|:focus-within|:focus(?![\w-])/g;

function removesOutline(declaration: Declaration): boolean {
  const spaced = declaration.value.replace(/\s+/g, " ");
  const tokens = splitTop(spaced, " ");
  if (declaration.property === "outline") return tokens.includes("none") || ZERO_LENGTH.test(tokens[0] ?? "");
  if (declaration.property === "outline-style") return declaration.value === "none" || declaration.value === "hidden";
  if (declaration.property === "outline-width") return ZERO_LENGTH.test(declaration.value);
  return false;
}

/** A focus indicator: a visible outline, or a ring drawn with box-shadow. */
function drawsFocusIndicator(declaration: Declaration): boolean {
  if (declaration.property === "outline") return !removesOutline(declaration);
  return declaration.property === "box-shadow" && declaration.value !== "none";
}

/**
 * A replacement only wins the cascade from the same layer and at-rule context as the removal,
 * because a later layer beats an earlier one whatever the specificity.
 */
function findBareOutlineRemovals(all: readonly StyleRule[]): string[] {
  const problems: string[] = [];
  for (const rule of all) {
    if (rule.keyframes || !rule.declarations.some(removesOutline)) continue;
    const label = where(rule);
    const group = rule.conditions.join("\n");
    for (const part of selectorParts(rule)) {
      const bare = part.replace(FOCUS_STATE, "");
      const replaced = all.some((other) => {
        if (other.keyframes || other.layer !== rule.layer || other.conditions.join("\n") !== group) return false;
        if (!other.declarations.some(drawsFocusIndicator)) return false;
        return selectorParts(other).some((candidate) => candidate.includes(":focus-visible") && candidate.replace(FOCUS_STATE, "") === bare);
      });
      if (!replaced) problems.push(`${label}: removes the outline of ${part} with no :focus-visible replacement in its layer`);
    }
  }
  return problems;
}

/* ---------------------------------- color-scheme and theme-color ---------------------------------- */

const COLOR_SCHEMES = [
  [":root", "light dark"],
  [':root[data-vc-theme="light"]', "light"],
  [':root[data-vc-theme="dark"]', "dark"],
] as const;

function findColorSchemeProblems(all: readonly StyleRule[]): string[] {
  const problems: string[] = [];
  for (const [selector, expected] of COLOR_SCHEMES) {
    const actual = lastDeclared(all, selector, "color-scheme");
    const normalised = actual?.toLowerCase().replace(/\s+/g, " ");
    if (normalised !== expected) problems.push(`${selector}: expected color-scheme: ${expected}, found ${actual ?? "none"}`);
  }
  return problems;
}

const HEX = /^#[0-9a-f]{3,8}$/i;

interface ThemeColorMeta {
  readonly media: string;
  readonly content: string;
}

function themeColorMetas(html: string): ThemeColorMeta[] {
  const metas: ThemeColorMeta[] = [];
  const markup = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const found of markup.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const [, name, value] of found[0].matchAll(/([a-z-]+)\s*=\s*"([^"]*)"/gi)) {
      const key = (name ?? "").toLowerCase();
      attributes.set(key, value ?? "");
    }
    if (attributes.get("name")?.toLowerCase() !== "theme-color") continue;
    const media = (attributes.get("media") ?? "").toLowerCase().replace(/\s+/g, "");
    metas.push({ media, content: attributes.get("content") ?? "" });
  }
  return metas;
}

function findThemeColorProblems(html: string, all: readonly StyleRule[]): string[] {
  const problems: string[] = [];
  const light = lastDeclared(all, ":root", "--vc-bg");
  const dark = lastDeclared(all, ':root[data-vc-theme="dark"]', "--vc-bg");
  const background = { light, dark };
  const metas = themeColorMetas(html);
  if (metas.length !== 2) problems.push(`expected exactly two theme-color metas, found ${metas.length}`);
  for (const scheme of ["light", "dark"] as const) {
    const expected = background[scheme];
    if (!expected || !HEX.test(expected)) {
      problems.push(`--vc-bg of the ${scheme} palette is not a literal hex (${expected ?? "missing"})`);
      continue;
    }
    const meta = metas.find((candidate) => candidate.media === `(prefers-color-scheme:${scheme})`);
    if (!meta) problems.push(`no theme-color meta for (prefers-color-scheme: ${scheme})`);
    else if (meta.content.toLowerCase() !== expected.toLowerCase()) problems.push(`theme-color for ${scheme} is ${meta.content}, --vc-bg is ${expected}`);
  }
  return problems;
}

/* ---------------------------------- touch-action and text-wrap ---------------------------------- */

/** Tap targets. `.vc-btn` covers the scrub's Previous/Next, `.vc-scrub-range` its slider. */
const TOUCH_TARGETS: readonly string[] = [".vc-btn", ".vc-option", ".vc-tab", ".vc-scrub-range", ".vc-term-btn", ".vc-pin-x"];

function findTouchActionProblems(all: readonly StyleRule[]): string[] {
  const problems: string[] = [];
  for (const target of TOUCH_TARGETS) {
    const covered = all.some(
      (rule) =>
        !rule.keyframes &&
        rule.conditions.length === 0 &&
        rule.declarations.some((declaration) => declaration.property === "touch-action" && declaration.value === "manipulation") &&
        selectorParts(rule).some((part) => subject(part) === target),
    );
    if (!covered) problems.push(`${target}: no unconditional rule sets touch-action: manipulation`);
  }
  return problems;
}

const BALANCED: readonly string[] = [".vc-h1", ".vc-h2", "h1", "h2", "h3", "h4"];
const PRETTY: readonly string[] = [".vc-muted", ".vc-answer", "p", "li"];

function findTextWrapProblems(all: readonly StyleRule[]): string[] {
  const values = new Map<string, Set<string>>();
  for (const rule of all) {
    if (rule.keyframes || rule.conditions.length > 0) continue;
    for (const declaration of rule.declarations) {
      if (declaration.property !== "text-wrap") continue;
      for (const part of selectorParts(rule)) {
        const key = subject(part);
        const seen = values.get(key) ?? new Set<string>();
        seen.add(declaration.value);
        values.set(key, seen);
      }
    }
  }
  const problems: string[] = [];
  const expectations: [readonly string[], string][] = [
    [BALANCED, "balance"],
    [PRETTY, "pretty"],
  ];
  for (const [targets, expected] of expectations) {
    for (const target of targets) {
      const seen = values.get(target);
      const actual = seen ? [...seen].sort().join(" ") : "";
      if (actual !== expected) problems.push(`${target}: expected text-wrap: ${expected}, found ${actual || "none"}`);
    }
  }
  return problems;
}

/* Motion values must come from defined custom properties, except the reduce override. */
function findMotionTokenProblems(all: readonly StyleRule[]): string[] {
  const defined = new Set(all.flatMap((rule) => rule.declarations.filter((d) => d.property.startsWith("--")).map((d) => d.property)));
  const problems: string[] = [];
  for (const rule of all) {
    for (const declaration of rule.declarations) {
      if (!/^(?:transition|animation)(?:-|$)/.test(declaration.property)) continue;
      if (motionPreference(rule.conditions) === "reduce" && declaration.important && declaration.value === "0.01ms") continue;
      const value = declaration.value;
      if (/(?:^|[^\w.-])(?:\d*\.?\d+)(?:ms|s)\b/i.test(value) ||
          /(?:^|[^\w-])(?:ease(?:-in|-out|-in-out)?|linear|step-start|step-end|steps|cubic-bezier|linear)\b/i.test(value)) {
        problems.push(`${where(rule)}: literal motion value ${value}`);
      }
      for (const match of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!defined.has(match[1]!)) problems.push(`${where(rule)}: undefined ${match[1]}`);
      }
    }
  }
  return problems;
}

const STATE_CUES: readonly [string, string][] = [
  ["selected option", '.vc-option[aria-pressed="true"]::before'],
  ["pinned term", '.vc-term-btn[aria-pressed="true"]'],
  ["active tab", 'vc-tabs .vc-tab[aria-selected="true"]'],
  ["active ladder level", 'vc-tabs[variant="ladder"] .vc-tab[aria-selected="true"]'],
];

function findStateCueProblems(all: readonly StyleRule[]): string[] {
  return STATE_CUES.flatMap(([name, selector]) => {
    const matching = all.filter((rule) => rule.conditions.length === 0 && selectorParts(rule).includes(selector));
    const cue = matching.some((rule) => rule.declarations.some(({ property, value }) =>
      (property === "content" && /::(?:before|after)$/.test(selector) && !/^(?:none|normal|["']{2})$/.test(value)) ||
      (property === "font-weight" && /^(?:bold|bolder|[6-9]00|650)$/.test(value)) ||
      (property === "text-decoration-style" && /^(?:solid|double|dashed|wavy)$/.test(value)) ||
      (/^(?:border|outline)(?:-[\w]+)?-(?:width|style)$/.test(property) && !/^(?:0|none|hidden)$/.test(value)) ||
      (/^(?:border|outline)(?:-(?:top|bottom|left|right|inline-start|inline-end))?$/.test(property) && /\b(?:solid|dashed|dotted|double)\b/.test(value) && !/^0(?:\s|$)/.test(value))
    ));
    return cue ? [] : [`${name}: missing non-color cue`];
  });
}

test("motion declarations use defined tokens instead of literal times or easing", () => {
  expect(findMotionTokenProblems(rules)).toEqual([]);
  const literal = source.replace("var(--vc-dur-fast)", "160ms");
  const missing = source.replace("var(--vc-dur-fast)", "var(--vc-dur-missing)");
  expect(literal).not.toBe(source);
  expect(missing).not.toBe(source);
  expect(findMotionTokenProblems(parseStyleRules(literal)).join("\n")).toContain("literal motion value");
  expect(findMotionTokenProblems(parseStyleRules(missing)).join("\n")).toContain("--vc-dur-missing");
});

test("selected option, pinned term, active tab and ladder level have non-color cues", () => {
  expect(findStateCueProblems(rules)).toEqual([]);
  for (const [name, selector] of STATE_CUES) {
    const rule = rules.find((candidate) => candidate.conditions.length === 0 && candidate.selector === selector);
    expect(rule).toBeDefined();
    const block = `${selector} {`;
    const start = source.indexOf(block);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = source.indexOf("}", start);
    const broken = source.slice(0, start) + `${selector} { color: red; }` + source.slice(end + 1);
    expect(findStateCueProblems(parseStyleRules(broken))).toContain(`${name}: missing non-color cue`);
  }
});

/* ---------------------------------- the real stylesheet ---------------------------------- */

const rules = parseStyleRules(source);

test("components.css never transitions all", () => {
  const uses = transitionUses(rules);
  const problems = findTransitionAll(rules);
  expect(uses.length).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test("transitions and keyframes animate explicit paint properties only, never layout", () => {
  const transitions = findNonPaintTransitions(rules);
  const animations = findNonPaintAnimations(rules);
  expect(transitions).toEqual([]);
  expect(animations).toEqual([]);
  const broken = parseStyleRules("@keyframes shift { to { width: 10px; opacity: 1; } }");
  const problems = findNonPaintAnimations(broken);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("width");
});

test("every transition and animation sits under prefers-reduced-motion: no-preference or is neutralised under reduce", () => {
  const problems = findUnscopedMotion(rules);
  expect(problems).toEqual([]);
});

test("no outline is removed without a :focus-visible replacement in the same layer", () => {
  const problems = findBareOutlineRemovals(rules);
  expect(problems).toEqual([]);
});

test("the root declares color-scheme: light dark, and each theme pin declares its own scheme", () => {
  const problems = findColorSchemeProblems(rules);
  expect(problems).toEqual([]);
});

test("tap targets declare touch-action: manipulation, and the scrub builds no control outside that list", () => {
  const problems = findTouchActionProblems(rules);
  expect(problems).toEqual([]);

  const controls: string[] = [];
  const variables = [...scrubScript.matchAll(/const (\w+) = document\.createElement\("(?:button|input)"\)/g)];
  for (const variable of variables) {
    const assignment = new RegExp(`${variable[1]}\\.className = "([^"]+)"`, "g");
    for (const named of scrubScript.matchAll(assignment)) {
      const names = (named[1] ?? "").split(/\s+/);
      controls.push(...names);
    }
  }
  expect(controls).toContain("vc-scrub-range");
  for (const name of controls) expect(TOUCH_TARGETS).toContain(`.${name}`);
});

test("headings balance their lines and prose uses pretty wrapping", () => {
  const problems = findTextWrapProblems(rules);
  expect(problems).toEqual([]);
});

test("the frame's theme-color metas carry the literal --vc-bg of the light and dark palettes", () => {
  const problems = findThemeColorProblems(frame, rules);
  expect(problems).toEqual([]);
});

/* ---------------------------------- the checks themselves ---------------------------------- */

test("the reader keeps layer, at-rule and keyframes context, drops comments, expands :is and :where, and refuses nesting", () => {
  const parsed = parseStyleRules(`
    @layer a, b;
    @layer b {
      @media (prefers-reduced-motion: reduce) { .x { animation: none !important; } }
      @keyframes spin { from { opacity: 0; } to { opacity: 1; } }
      /* .fake { transition: all 1s; } */
    }
  `);
  const selectors = parsed.map((rule) => rule.selector);
  expect(selectors).toEqual([".x", "from", "to"]);
  expect(parsed[0]).toMatchObject({ layer: "b", conditions: ["@media (prefers-reduced-motion: reduce)"], keyframes: null });
  expect(parsed[0]?.declarations).toEqual([{ property: "animation", value: "none", important: true }]);
  expect(parsed[1]).toMatchObject({ layer: "b", conditions: [], keyframes: "spin" });
  expect(() => parseStyleRules(".a { .b { color: red; } }")).toThrow(/nested/);

  const [probe] = parseStyleRules(".vc-main :is(h1, h2), :where(.a, .b):focus-visible { color: red; }");
  const expanded = probe ? selectorParts(probe) : [];
  expect(expanded).toEqual([".vc-main h1", ".vc-main h2", ".a:focus-visible", ".b:focus-visible"]);
});

test("transition properties are read per comma segment, and a segment naming none transitions all", () => {
  const properties = (css: string): string[] => transitionUses(parseStyleRules(css)).map((use) => use.property);
  expect(properties(".a { transition: transform 1s, opacity 1s cubic-bezier(0.2, 0, 0, 1) 50ms; }")).toEqual(["transform", "opacity"]);
  expect(properties(".a { transition: width 1s, background 1s; }")).toEqual(["width", "background"]);
  expect(properties(".a { transition: 1s ease; }")).toEqual(["all"]);
  expect(properties(".a { transition-property: opacity, height; }")).toEqual(["opacity", "height"]);
  expect(properties(".a { transition: none; transition-duration: 0.01ms; }")).toEqual([]);
});

test("motion is accepted under no-preference or when a reduce override reaches it, and flagged otherwise", () => {
  const flagged = (css: string): number => findUnscopedMotion(parseStyleRules(css)).length;
  const blanket = '@media (prefers-reduced-motion: reduce) { :where([class^="vc-"]) { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; } }';
  const weak = '@media (prefers-reduced-motion: reduce) { :where([class^="vc-"]) { transition-duration: 0.01ms; } }';
  expect(flagged(".vc-a { transition: opacity 1s; }")).toBe(1);
  expect(flagged("@media (prefers-reduced-motion: no-preference) { .vc-a { transition: opacity 1s; } }")).toBe(0);
  expect(flagged("@media (prefers-reduced-motion: reduce) { .vc-a { animation: spin 1s; } }")).toBe(1);
  expect(flagged(`${blanket} .vc-a { transition: opacity 1s; }`)).toBe(0);
  expect(flagged(`${weak} .vc-a { transition: opacity 1s; }`)).toBe(1);
  expect(flagged(`${blanket} .vc-a { scroll-behavior: smooth; }`)).toBe(1);
  expect(flagged(`${blanket} .page { transition: opacity 1s; }`)).toBe(1);
  expect(flagged(".page { transition: opacity 1s; } @media (prefers-reduced-motion: reduce) { .page { transition: none; } }")).toBe(0);
});

test("an outline removal needs a :focus-visible outline or ring in its own layer", () => {
  const flagged = (css: string): number => findBareOutlineRemovals(parseStyleRules(css)).length;
  expect(flagged(".a { outline: none; }")).toBe(1);
  expect(flagged(".a { outline: 0; }")).toBe(1);
  expect(flagged(".a { outline-style: none; }")).toBe(1);
  expect(flagged(".a { outline: 2px solid transparent; }")).toBe(0);
  expect(flagged(".a:focus { outline: none; } .a:focus-visible { outline: 2px solid red; }")).toBe(0);
  expect(flagged(".a { outline: none; } :where(.a):focus-visible { box-shadow: 0 0 0 2px red; }")).toBe(0);
  expect(flagged("@layer x { .a { outline: none; } } @layer y { .a:focus-visible { outline: 2px solid red; } }")).toBe(1);
});

/* ---------------------------------- in-memory mutations of the real file ---------------------------------- */

/** Puts `text` first inside the component layer, so it is read as one more rule of the real file. */
function withRuleInComponents(css: string, text: string): string {
  const opener = "@layer vc.components {";
  const at = css.indexOf(opener);
  expect(at).toBeGreaterThanOrEqual(0);
  const end = at + opener.length;
  const head = css.slice(0, end);
  const tail = css.slice(end);
  return `${head}\n${text}\n${tail}`;
}

test("mutation: a `transition: all` added to the stylesheet is detected, even under no-preference", () => {
  const mutated = withRuleInComponents(source, "@media (prefers-reduced-motion: no-preference) { .vc-btn { transition: all 150ms ease; } }");
  const mutatedRules = parseStyleRules(mutated);
  const problems = findTransitionAll(mutatedRules);
  const unscoped = findUnscopedMotion(mutatedRules);
  const baseline = findTransitionAll(rules);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain(".vc-btn");
  expect(unscoped).toEqual([]);
  expect(baseline).toEqual([]);
});

test("mutation: a bare `outline: none` or `outline: 0` is detected, though the base layer rings the same control", () => {
  const bare = withRuleInComponents(source, ".vc-btn { outline: none; }\n.vc-input { outline: 0; }");
  const problems = findBareOutlineRemovals(parseStyleRules(bare));
  const text = problems.join("\n");
  expect(problems).toHaveLength(2);
  expect(text).toContain(".vc-btn");
  expect(text).toContain(".vc-input");

  const replaced = withRuleInComponents(source, ".vc-btn { outline: none; }\n.vc-btn:focus-visible { outline: 2px solid var(--vc-accent); }");
  const remaining = findBareOutlineRemovals(parseStyleRules(replaced));
  expect(remaining).toEqual([]);
});

test("mutation: dropping color-scheme, or weakening the root to light only, is detected", () => {
  const dropped = source.replace(/(?<![\w-])color-scheme\s*:[^;}]*;?/g, "");
  expect(dropped).not.toBe(source);
  const droppedProblems = findColorSchemeProblems(parseStyleRules(dropped));
  expect(droppedProblems).toHaveLength(COLOR_SCHEMES.length);

  const weakened = source.replace("color-scheme: light dark", "color-scheme: light");
  expect(weakened).not.toBe(source);
  const weakenedProblems = findColorSchemeProblems(parseStyleRules(weakened));
  expect(weakenedProblems).toHaveLength(1);
  expect(weakenedProblems[0]).toContain(":root:");
});

test("a theme-color that drifts from --vc-bg, or loses its media query, is detected", () => {
  const dark = lastDeclared(rules, ':root[data-vc-theme="dark"]', "--vc-bg") ?? "";
  expect(dark).toMatch(HEX);

  const stale = frame.replace(dark, "#000000");
  expect(stale).not.toBe(frame);
  const staleProblems = findThemeColorProblems(stale, rules);
  expect(staleProblems.join("\n")).toContain("theme-color for dark");

  const unconditional = frame.replace(/ media="\(prefers-color-scheme: dark\)"/, "");
  expect(unconditional).not.toBe(frame);
  const unconditionalProblems = findThemeColorProblems(unconditional, rules);
  expect(unconditionalProblems.join("\n")).toContain("(prefers-color-scheme: dark)");
});
