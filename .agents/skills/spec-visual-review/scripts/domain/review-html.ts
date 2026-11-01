import { ReviewError } from "./errors";
import type { Item, ParsedSpec, Scenario, Story } from "./spec";

/** Requirement id -> scenario or criterion ids. A leading `~` marks a partial match. */
export type LinkMap = Readonly<Record<string, readonly string[]>>;

export interface ReviewInput {
  spec: ParsedSpec;
  /** Thai line for an exact English string. The caller guarantees every string has one. */
  thai: (text: string) => string;
  /** Ids of Thai lines that failed an automatic check. */
  flagged: ReadonlySet<string>;
  /** Reviewer-inferred links. `null` omits the traceability matrix. */
  links: LinkMap | null;
  /** Trusted review commentary fragments, each starting with an `<h2>`. */
  pre: readonly string[];
  post: readonly string[];
  /** Trusted figure and notes placed above the entity table. */
  entitiesHtml: string | null;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const esc = escapeHtml;

/** Fixed page labels with their Thai wording. */
const LABELS = {
  stepGiven: ["Given", "กำหนดให้"],
  stepWhen: ["When", "เมื่อ"],
  stepThen: ["Then", "แล้ว"],
  original: ["Original wording", "ข้อความต้นฉบับ"],
  edge: ["Edge cases", "กรณีขอบ"],
  requirements: ["Functional requirements", "ข้อกำหนดเชิงหน้าที่"],
  traceability: ["Traceability", "ความสอดคล้องของข้อกำหนด"],
  entities: ["Key entities", "เอนทิตีหลัก"],
  criteria: ["Success criteria", "เกณฑ์ความสำเร็จ"],
  assumptions: ["Assumptions", "สมมติฐาน"],
  originalRequirement: ["Original requirement", "ข้อกำหนดต้นฉบับ"],
  originalCriterion: ["Original criterion", "เกณฑ์ต้นฉบับ"],
  originalDefinition: ["Original definition", "คำนิยามต้นฉบับ"],
  keywords: ["Keywords", "คำสำคัญ"],
  coverage: ["Inferred coverage", "ความครอบคลุม (อนุมาน)"],
  verifies: ["Verifies (inferred)", "ตรวจสอบ (อนุมาน)"],
  entity: ["Entity", "เอนทิตี"],
  requirement: ["Requirement", "ข้อกำหนด"],
  why: ["Why this priority", "เหตุผลของลำดับความสำคัญ"],
  test: ["Independent test", "การทดสอบอิสระ"],
  glossary: ["Entity names in Thai", "ชื่อเอนทิตีเป็นภาษาไทย"],
} as const satisfies Record<string, readonly [string, string]>;

type LabelKey = keyof typeof LABELS;

/** A fixed label in both languages. The page toggle chooses which one shows. */
function label(key: LabelKey): string {
  const [en, th] = LABELS[key];
  return `<span class="lbl"><span class="en">${en}</span><span class="th" lang="th">${th}</span></span>`;
}

function heading(key: LabelKey): string {
  const [en, th] = LABELS[key];
  return `<h2 data-title="${en}" data-th="${th}">${label(key)}</h2>`;
}

function thaiLine(id: string, text: string, input: ReviewInput): string {
  const mark = input.flagged.has(id) ? ' <span class="chip inferred">needs review</span>' : "";
  const tag = '<span class="th-tag">Thai translation, not source · คำแปล ไม่ใช่ต้นฉบับ</span>';
  return `<p class="th" lang="th">${tag}${esc(input.thai(text))}${mark}</p>`;
}

function bilingual(id: string, text: string, html: string, input: ReviewInput): string {
  return `<div class="en">${html}</div>${thaiLine(id, text, input)}`;
}

function keywordChips(text: string): string {
  const not = /\bMUST NOT\b/.test(text) ? '<span class="chip must-not">MUST NOT</span>' : "";
  const must = /\bMUST\b(?! NOT)/.test(text) ? '<span class="chip must">MUST</span>' : "";
  return not + must;
}

function renderScenario(scenario: Scenario, input: ReviewInput): string {
  const step = (key: "stepGiven" | "stepWhen" | "stepThen", text: string): string =>
    `<div class="step"><b>${label(key)}</b><span class="en">${esc(text)}</span></div>`;
  const arrow = '<span class="arrow" aria-hidden="true">→</span>';
  const strip = `<div class="strip">${step("stepGiven", scenario.given)}${arrow}${step("stepWhen", scenario.when)}${arrow}${step("stepThen", scenario.outcome)}</div>`;
  const original = `<details><summary><span class="id">${scenario.id}</span>${label("original")}</summary><div class="body"><div class="original"><p>${esc(scenario.text)}</p></div></div></details>`;
  return [
    `<p><span class="id">${scenario.id}</span></p>`,
    `<div class="en">${strip}${original}</div>`,
    thaiLine(scenario.id, scenario.text, input),
  ].join("\n");
}

function renderStory(story: Story, index: number, input: ReviewInput): string {
  const prefix = `S${index + 1}`;
  const titleTh = esc(input.thai(story.title));
  const title = `<h2 data-title="${esc(story.title)}" data-th="${titleTh}"><span class="en">${esc(story.title)}</span><span class="th" lang="th">${titleTh}</span></h2>`;
  const parts: string[] = [
    title,
    bilingual(`${prefix}.intro`, story.intro, esc(story.intro), input),
  ];
  const fields: ReadonlyArray<readonly [string, LabelKey, string]> = [
    [`${prefix}.why`, "why", story.why],
    [`${prefix}.test`, "test", story.test],
  ];
  for (const [id, key, text] of fields) {
    parts.push(bilingual(id, text, `<strong>${label(key)}:</strong> ${esc(text)}`, input));
  }
  for (const scenario of story.scenarios) parts.push(renderScenario(scenario, input));
  return parts.join("\n");
}

function renderCards(
  key: LabelKey,
  idPrefix: string,
  texts: readonly string[],
  input: ReviewInput,
) {
  const cards = texts.map((text, index) => {
    const body = bilingual(`${idPrefix}-${index + 1}`, text, esc(text), input);
    return `<div class="notice">${body}</div>`;
  });
  return `${heading(key)}<div class="cards">${cards.join("")}</div>`;
}

function coverageChips(refs: readonly string[] | undefined): string {
  if (!refs || refs.length === 0) return '<span class="gap">No AC or SC match</span>';
  return refs
    .map((ref) => {
      const text = ref.startsWith("~") ? `${ref.slice(1)} (partial)` : ref;
      return `<span class="chip inferred">${esc(text)}</span>`;
    })
    .join("");
}

function renderRequirements(input: ReviewInput): string {
  const links = input.links;
  const rows = input.spec.requirements.map((req) => {
    const cell = bilingual(req.id, req.text, esc(req.text), input);
    const coverage = links ? `<td>${coverageChips(links[req.id])}</td>` : "";
    return `<tr><td><span class="id">${req.id}</span></td><td>${cell}</td><td>${keywordChips(req.text)}</td>${coverage}</tr>`;
  });
  const extra = links ? `<th>${label("coverage")}</th>` : "";
  const head = `<th>ID</th><th>${label("originalRequirement")}</th><th>${label("keywords")}</th>${extra}`;
  return `${heading("requirements")}<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function renderTraceability(input: ReviewInput, links: LinkMap): string {
  const scenarioIds = input.spec.stories.flatMap((s) => s.scenarios.map((sc) => sc.id)).sort();
  const columns = [...scenarioIds, ...input.spec.criteria.map((c) => c.id)];
  const head = columns.map((column) => `<th>${column}</th>`).join("");
  const rows = input.spec.requirements.map((req) => {
    const refs = links[req.id] ?? [];
    const cells = columns.map((column) => {
      const mark = refs.includes(column) ? "✓" : refs.includes(`~${column}`) ? "~" : "";
      return `<td${mark ? ' title="Inferred match"' : ""}>${mark}</td>`;
    });
    return `<tr><td>${req.id}</td>${cells.join("")}</tr>`;
  });
  const gaps = input.spec.requirements.filter((req) => (links[req.id] ?? []).length === 0);
  const finding =
    gaps.length > 0
      ? `${gaps.map((g) => g.id).join(", ")} have no matching acceptance scenario or success criterion in the draft.`
      : "Every requirement has at least one inferred match.";
  const note =
    "<strong>Inferred review aid.</strong> <code>spec.md</code> does not state these links. ✓ means the scenario or criterion appears to cover the requirement; ~ means partly. Requirements with no match are review findings, not spec content.";
  return `${heading("traceability")}<div class="notice">${note}</div><div class="tablewrap"><table class="matrix"><thead><tr><th>${label("requirement")}</th>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div><p><strong>Review findings:</strong> ${finding}</p>`;
}

function renderEntities(input: ReviewInput): string {
  const entities: readonly Item[] = input.spec.entities;
  const glossary = entities
    .map((e) => `<li>${esc(e.id)} — <span lang="th">${esc(input.thai(e.id))}</span></li>`)
    .join("");
  const rows = entities.map((entity) => {
    const cell = bilingual(`ENT:${entity.id}`, entity.text, esc(entity.text), input);
    return `<tr><td><strong>${esc(entity.id)}</strong></td><td>${cell}</td></tr>`;
  });
  const table = `<div class="tablewrap"><table><thead><tr><th>${label("entity")}</th><th>${label("originalDefinition")}</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  const gloss = `<p class="th"><span class="th-tag">${LABELS.glossary[1]} · Thai translation, not source</span></p><ul class="th gloss">${glossary}</ul>`;
  return `${heading("entities")}${input.entitiesHtml ?? ""}${gloss}${table}`;
}

function renderCriteria(input: ReviewInput): string {
  const links = input.links;
  const rows = input.spec.criteria.map((criterion) => {
    const cell = bilingual(criterion.id, criterion.text, esc(criterion.text), input);
    const verified = links
      ? input.spec.requirements
          .filter((req) =>
            (links[req.id] ?? []).some((ref) => ref.replace("~", "") === criterion.id),
          )
          .map((req) => `<span class="chip inferred">${req.id}</span>`)
          .join("")
      : "";
    const verifies = links ? `<td>${verified}</td>` : "";
    return `<tr><td><span class="id">${criterion.id}</span></td><td>${cell}</td>${verifies}</tr>`;
  });
  const extra = links ? `<th>${label("verifies")}</th>` : "";
  const head = `<th>ID</th><th>${label("originalCriterion")}</th>${extra}`;
  return `${heading("criteria")}<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export function renderBody(input: ReviewInput): string {
  const { spec } = input;
  const sections: string[] = [...input.pre];
  for (const [index, story] of spec.stories.entries()) {
    sections.push(renderStory(story, index, input));
  }
  sections.push(renderCards("edge", "EDGE", spec.edgeCases, input));
  sections.push(renderRequirements(input));
  if (input.links) sections.push(renderTraceability(input, input.links));
  sections.push(renderEntities(input));
  sections.push(renderCriteria(input));
  sections.push(renderCards("assumptions", "ASM", spec.assumptions, input));
  sections.push(...input.post);
  return sections.join("\n");
}

/** Puts the page title, header and body into the template's `<title>`, `<header>` and `<main>`. */
export function applyTemplate(
  template: string,
  title: string,
  subtitle: string,
  body: string,
): string {
  const slots: ReadonlyArray<readonly [string, RegExp, string]> = [
    ["<title>", /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`],
    [
      "<header>",
      /<header>[\s\S]*?<\/header>/,
      `<header><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></header>`,
    ],
    ["<main>", /<main>[\s\S]*?<\/main>/, `<main>${body}</main>`],
  ];
  let page = template;
  for (const [name, pattern, html] of slots) {
    if (!pattern.test(page)) throw new ReviewError(`Template has no ${name} element`);
    page = page.replace(pattern, () => html);
  }
  return page;
}
