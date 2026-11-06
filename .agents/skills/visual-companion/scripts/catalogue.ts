/*
 * assets/catalogue.json (version 2) is the single source of truth for the authoring surface.
 * One file, and nothing else keeps its own list of components:
 *
 *   consumer                    derives from
 *   `cli.ts components`         groups, names, what, attrs
 *   `cli.ts gallery`            group + snippet: one specimen per entry
 *   markup.ts lint              names, parts, internal, attrs, `for` links
 *   spacing.test.ts             `spacing`  -> surfaces and containers that space their children
 *   contrast.test.ts            `boundary` -> which rules must use the 3:1 control token
 *   catalogue.test.ts           names, parts, internal <-> CSS classes; element entries <->
 *                               the ELEMENTS registry; `degrade` <-> a no-script CSS rule
 *   scope.test.ts               internal `scope: "frame"` -> classes only the frame layer may style
 *
 * `validateCatalogue` is the boundary: it builds the typed value field by field, so nothing
 * downstream re-checks shapes, and it reports every problem at once instead of the first.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CATALOGUE_PATH = join(import.meta.dir, "..", "assets", "catalogue.json");

export interface Group {
  readonly id: string;
  /** Gallery section heading. */
  readonly title: string;
}

/** What the spacing test needs to know about an entry. */
export interface Spacing {
  /** Draws its own border or fill; two of them touching read as one box. */
  readonly surface: boolean;
  /** Spaces its own children (gap or child margins); a bare <div> does not. */
  readonly spaces: boolean;
}

interface Base {
  /** Every public name this entry introduces, `vc-` prefixed, at least one. */
  readonly names: readonly string[];
  /** Sub-parts named only inside this entry (vc-card-head, vc-tab). Legal markup wherever the entry is. */
  readonly parts: readonly string[];
  readonly group: string;
  /** One line, printed by `cli components`; what an agent reads to choose. */
  readonly what: string;
  /** Runnable markup: the gallery specimen and the lint fixture. The shortest correct use. */
  readonly snippet: string;
  readonly spacing: Spacing;
  /** CSS selector of the element that draws a control boundary, when the entry is interactive. */
  readonly boundary: string | null;
}

export interface ClassEntry extends Base {
  readonly kind: "class";
}

export const DEGRADE_KINDS = [
  "content", //              identical without scripts; no rule needed
  "nothing", //              the element is empty or hidden; no rule needed
  "first-panel", //          satisfied by the :has(> [data-active]) fallback
  "all-panels", //           needs a :not([data-ready]) rule
  "answer", //               needs a :not([data-ready]) rule
  "source-text", //          needs a :not([data-ready]) rule
  "definition-on-hover", //  needs a :not([data-ready]) rule
] as const;

export type DegradeKind = (typeof DEGRADE_KINDS)[number];

/** Degrade kinds whose no-script form is only reachable through a `:not([data-ready])` rule. */
export const NEEDS_READY_RULE: ReadonlySet<DegradeKind> = new Set<DegradeKind>([
  "all-panels",
  "answer",
  "source-text",
  "definition-on-hover",
]);

/** What the reader sees without scripts. `when` is an attribute selector fragment such as
 *  `[variant="ladder"]`, null for the default form. */
export interface Degrade {
  readonly when: string | null;
  readonly shows: DegradeKind;
}

export interface ElementEntry extends Base {
  readonly kind: "element";
  /** attr -> one-line meaning. */
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: string | null;
  readonly events: Readonly<Record<string, string>>;
  readonly methods: string | null;
  /** Without scripts nothing runs: compare, states and isolated previews never load them. At least one. */
  readonly degrade: readonly Degrade[];
}

export type Entry = ClassEntry | ElementEntry;

export interface ModeEntry {
  readonly mode: "bundle" | "plain";
  readonly when: string;
  readonly gets: string;
}

/** Classes that exist in the CSS but are not authoring surface. Listing them is what lets
 *  catalogue.test fail on a CSS class nobody catalogued. */
export interface Internal {
  readonly names: readonly string[];
  readonly why: string;
  readonly boundary: string | null;
  /** The names space their children, so the spacing test treats them as containers. */
  readonly spaces: boolean;
  /** "frame": only the vc.frame layer may style these (shell and page chrome). */
  readonly scope: "frame" | null;
}

export interface Catalogue {
  readonly version: 2;
  readonly modes: readonly ModeEntry[];
  readonly groups: readonly Group[];
  readonly entries: readonly Entry[];
  readonly internal: readonly Internal[];
  readonly recorded: string;
}

export type Validation =
  | { readonly ok: true; readonly catalogue: Catalogue }
  | { readonly ok: false; readonly problems: readonly string[] };

const NAME = /^vc-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDegradeKind(value: unknown): value is DegradeKind {
  return DEGRADE_KINDS.some((kind) => kind === value);
}

class Reader {
  readonly problems: string[] = [];

  fail(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  object(value: unknown, path: string): Record<string, unknown> {
    if (isRecord(value)) return value;
    this.fail(path, "must be an object");
    return {};
  }

  array(value: unknown, path: string): readonly unknown[] {
    if (Array.isArray(value)) return value;
    this.fail(path, "must be an array");
    return [];
  }

  text(source: Record<string, unknown>, key: string, path: string): string {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    this.fail(`${path}.${key}`, "must be a non-empty string");
    return "";
  }

  optionalText(source: Record<string, unknown>, key: string, path: string): string | null {
    const value = source[key];
    if (value === undefined) return null;
    if (typeof value === "string" && value.trim() !== "") return value;
    this.fail(`${path}.${key}`, "must be a non-empty string when present");
    return null;
  }

  flag(source: Record<string, unknown>, key: string, path: string): boolean {
    const value = source[key];
    if (value === undefined) return false;
    if (typeof value === "boolean") return value;
    this.fail(`${path}.${key}`, "must be a boolean when present");
    return false;
  }

  names(source: Record<string, unknown>, key: string, path: string, required: boolean): readonly string[] {
    const value = source[key];
    if (value === undefined && !required) return [];
    const list = this.array(value, `${path}.${key}`);
    if (required && list.length === 0) this.fail(`${path}.${key}`, "needs at least one name");
    const names: string[] = [];
    list.forEach((item, i) => {
      if (typeof item === "string" && NAME.test(item)) names.push(item);
      else this.fail(`${path}.${key}[${i}]`, "must be a lowercase `vc-` name");
    });
    return names;
  }

  strings(value: unknown, path: string): Readonly<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [key, item] of Object.entries(this.object(value, path))) {
      if (typeof item === "string") out[key] = item;
      else this.fail(`${path}.${key}`, "must be a string");
    }
    return out;
  }
}

function readSpacing(reader: Reader, source: Record<string, unknown>, path: string): Spacing {
  const spacing = reader.object(source["spacing"], `${path}.spacing`);
  const surface = spacing["surface"];
  const spaces = spacing["spaces"];
  if (typeof surface !== "boolean" || typeof spaces !== "boolean") {
    reader.fail(`${path}.spacing`, "needs boolean surface and spaces");
  }
  return { surface: surface === true, spaces: spaces === true };
}

function readDegrade(reader: Reader, value: unknown, path: string): readonly Degrade[] {
  const list = reader.array(value, path);
  if (list.length === 0) reader.fail(path, "needs at least one entry");
  const out: Degrade[] = [];
  list.forEach((item, i) => {
    const source = reader.object(item, `${path}[${i}]`);
    const shows = source["shows"];
    if (!isDegradeKind(shows)) {
      reader.fail(`${path}[${i}].shows`, `must be one of ${DEGRADE_KINDS.join(", ")}`);
      return;
    }
    out.push({ when: reader.optionalText(source, "when", `${path}[${i}]`), shows });
  });
  return out;
}

function readEntry(reader: Reader, raw: unknown, index: number, groups: ReadonlySet<string>): Entry | null {
  const path = `entries[${index}]`;
  const source = reader.object(raw, path);
  const kind = source["kind"];
  const names = reader.names(source, "names", path, true);
  const base = {
    names,
    parts: reader.names(source, "parts", path, false),
    group: reader.text(source, "group", path),
    what: reader.text(source, "what", path),
    snippet: reader.text(source, "snippet", path),
    spacing: readSpacing(reader, source, path),
    boundary: reader.optionalText(source, "boundary", path),
  };
  const label = names[0] ?? path;
  if (base.group && !groups.has(base.group)) reader.fail(`${label}.group`, `unknown group "${base.group}"`);
  if (base.snippet.includes("…")) reader.fail(`${label}.snippet`, "must be runnable markup, not a placeholder");

  if (kind === "class") return { kind, ...base };
  if (kind !== "element") {
    reader.fail(`${path}.kind`, 'must be "class" or "element"');
    return null;
  }
  return {
    kind,
    ...base,
    attrs: reader.strings(source["attrs"] ?? {}, `${label}.attrs`),
    children: reader.optionalText(source, "children", path),
    events: reader.strings(source["events"] ?? {}, `${label}.events`),
    methods: reader.optionalText(source, "methods", path),
    degrade: readDegrade(reader, source["degrade"], `${label}.degrade`),
  };
}

function readInternal(reader: Reader, raw: unknown, index: number): Internal {
  const path = `internal[${index}]`;
  const source = reader.object(raw, path);
  const scope = source["scope"];
  if (scope !== undefined && scope !== "frame") reader.fail(`${path}.scope`, 'must be "frame" when present');
  return {
    names: reader.names(source, "names", path, true),
    why: reader.text(source, "why", path),
    boundary: reader.optionalText(source, "boundary", path),
    spaces: reader.flag(source, "spaces", path),
    scope: scope === "frame" ? "frame" : null,
  };
}

function readMode(reader: Reader, raw: unknown, index: number): ModeEntry | null {
  const path = `modes[${index}]`;
  const source = reader.object(raw, path);
  const mode = source["mode"];
  if (mode !== "bundle" && mode !== "plain") {
    reader.fail(`${path}.mode`, 'must be "bundle" or "plain"');
    return null;
  }
  return { mode, when: reader.text(source, "when", path), gets: reader.text(source, "gets", path) };
}

/** Names must be unique across names, parts and internal; ids in snippets unique across entries,
 *  because the gallery puts every snippet on one page. */
function checkUniqueness(reader: Reader, entries: readonly Entry[], internal: readonly Internal[]): void {
  const seen = new Map<string, string>();
  const claim = (name: string, owner: string): void => {
    const first = seen.get(name);
    if (first) reader.fail(name, `declared twice (${first} and ${owner})`);
    else seen.set(name, owner);
  };
  for (const entry of entries) {
    for (const name of [...entry.names, ...entry.parts]) claim(name, entry.names[0] ?? "an entry");
  }
  for (const group of internal) {
    for (const name of group.names) claim(name, "internal");
  }
  const ids = new Map<string, string>();
  for (const entry of entries) {
    for (const [, id] of entry.snippet.matchAll(/\sid="([^"]+)"/g)) {
      const first = ids.get(id ?? "");
      if (first) reader.fail(`${entry.names[0]}.snippet`, `id "${id}" is also used by ${first}`);
      else ids.set(id ?? "", entry.names[0] ?? "an entry");
    }
  }
}

export function validateCatalogue(value: unknown): Validation {
  const reader = new Reader();
  const root = reader.object(value, "catalogue");
  if (root["version"] !== 2) reader.fail("version", "must be 2");

  const groups: Group[] = [];
  reader.array(root["groups"], "groups").forEach((raw, i) => {
    const source = reader.object(raw, `groups[${i}]`);
    groups.push({ id: reader.text(source, "id", `groups[${i}]`), title: reader.text(source, "title", `groups[${i}]`) });
  });
  const groupIds = new Set(groups.map((group) => group.id));
  if (groupIds.size !== groups.length) reader.fail("groups", "ids must be unique");

  const modes = reader.array(root["modes"], "modes").flatMap((raw, i) => readMode(reader, raw, i) ?? []);
  const entries = reader.array(root["entries"], "entries").flatMap((raw, i) => readEntry(reader, raw, i, groupIds) ?? []);
  const internal = reader.array(root["internal"], "internal").map((raw, i) => readInternal(reader, raw, i));
  const recorded = reader.text(root, "recorded", "catalogue");

  for (const group of groups) {
    if (!entries.some((entry) => entry.group === group.id)) reader.fail(`group ${group.id}`, "has no entries");
  }
  checkUniqueness(reader, entries, internal);

  if (reader.problems.length > 0) return { ok: false, problems: reader.problems };
  return { ok: true, catalogue: { version: 2, modes, groups, entries, internal, recorded } };
}

/** Reads and validates the catalogue file; throws with every problem when it is broken. */
export function loadCatalogue(path: string = CATALOGUE_PATH): Catalogue {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const result = validateCatalogue(raw);
  if (!result.ok) throw new Error(`invalid catalogue ${path}:\n${result.problems.map((problem) => `  - ${problem}`).join("\n")}`);
  return result.catalogue;
}

export function elementEntries(catalogue: Catalogue): readonly ElementEntry[] {
  return catalogue.entries.filter((entry): entry is ElementEntry => entry.kind === "element");
}

/** Names an author may write: entry names and their parts. */
export function authoringNames(catalogue: Catalogue): ReadonlySet<string> {
  return new Set(catalogue.entries.flatMap((entry) => [...entry.names, ...entry.parts]));
}

/** Every name the CSS may mention: authoring names plus internal ones. */
export function knownNames(catalogue: Catalogue): ReadonlySet<string> {
  return new Set([...authoringNames(catalogue), ...catalogue.internal.flatMap((group) => group.names)]);
}

/** The spacing test's three sets, derived instead of hand-listed. `surfaceTags` is the subset of
 *  surfaces that are custom elements. */
export function spacingSets(catalogue: Catalogue): {
  readonly surfaces: ReadonlySet<string>;
  readonly surfaceTags: ReadonlySet<string>;
  readonly providers: ReadonlySet<string>;
} {
  const surfaces = new Set<string>();
  const surfaceTags = new Set<string>();
  const providers = new Set<string>();
  for (const entry of catalogue.entries) {
    for (const name of entry.names) {
      if (entry.spacing.surface) surfaces.add(name);
      if (entry.spacing.surface && entry.kind === "element") surfaceTags.add(name);
      if (entry.spacing.spaces) providers.add(name);
    }
  }
  for (const group of catalogue.internal) {
    if (group.spaces) for (const name of group.names) providers.add(name);
  }
  return { surfaces, surfaceTags, providers };
}

/** Selectors of the elements that draw a control boundary, from entries and internal names. */
export function boundarySelectors(catalogue: Catalogue): readonly string[] {
  return [
    ...catalogue.entries.flatMap((entry) => (entry.boundary ? [entry.boundary] : [])),
    ...catalogue.internal.flatMap((group) => (group.boundary ? [group.boundary] : [])),
  ];
}
