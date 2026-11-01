import { escapeHtml } from "./review-html";

/** A small typed piece of a review page. Every text field is shown escaped, never as markup. */
export type Block =
  | { type: "heading"; level: 3 | 4; text: string }
  | { type: "text"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "cards"; cards: Card[] };

export interface Card {
  title: string;
  blocks: Block[];
}

export interface Section {
  title: string;
  blocks: Block[];
}

export interface Document {
  title: string;
  sections: Section[];
}

/** Sections with these words in the title show their level-3 headings as side-by-side cards. */
const CARD_SECTION = /approach|option|alternative/i;

export function foldCards(section: Section): Section {
  if (!CARD_SECTION.test(section.title)) return section;
  const lead: Block[] = [];
  const cards: Card[] = [];
  for (const block of section.blocks) {
    if (block.type === "heading" && block.level === 3) {
      cards.push({ title: block.text, blocks: [] });
    } else if (cards.length > 0) {
      cards[cards.length - 1]?.blocks.push(block);
    } else {
      lead.push(block);
    }
  }
  return cards.length === 0
    ? section
    : { title: section.title, blocks: [...lead, { type: "cards", cards }] };
}

/** Escapes text, then turns `code` and **bold** into tags. Links keep their text and lose the address. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

// Mask technical tokens without splitting the surrounding prose into context-free fragments.
const PROTECTED =
  /(`[^`]*`|https?:\/\/[^\s)]+|(?:\.{0,2}\/)?[\w.-]+\/[\w./-]+|\b[\w-]+\.[A-Za-z0-9]+\b|\b(?:Git|Orca|ai-sync|v2)\b|\b(?:[A-Z]+-\d+|[A-Z]\d+|(?!(?:MUST|NOT|SHOULD|REQUIRED|MAY)\b)[A-Z]{2,}(?:[-_][A-Z0-9]+)*)\b|\*\*|\[|\]\([^)]*\))/g;

export function protectMarkdown(text: string): {
  masked: string;
  restore: (result: string) => string | null;
} {
  const tokens: { marker: string; value: string }[] = [];
  let next = 0;
  const masked = text.replace(PROTECTED, (value: string) => {
    while (text.includes(`⟦${next}⟧`)) next++;
    const marker = `⟦${next++}⟧`;
    tokens.push({ marker, value });
    return marker;
  });
  return {
    masked,
    restore: (result) => {
      for (const { marker, value } of tokens) {
        if (result.split(marker).length !== 2) return null;
        result = result.replace(marker, () => value);
      }
      return /⟦\d+⟧/.test(result) ? null : result;
    },
  };
}

function translateText(text: string, translations: ReadonlyMap<string, string>): string | null {
  return translations.get(text.trim()) ?? null;
}

export function hasMarkdownProse(text: string): boolean {
  return /[A-Za-z]/.test(text.replace(PROTECTED, ""));
}

export function preservesMarkdownTokens(source: string, translation: string): boolean {
  const remaining = translation;
  const counts = new Map<string, number>();
  for (const token of source.match(PROTECTED) ?? [])
    counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts].every(([token, count]) => remaining.split(token).length - 1 >= count);
}

export function englishEcho(source: string, translation: string): boolean {
  const prose = translation.replace(PROTECTED, "");
  if (!hasMarkdownProse(source)) return false;
  if (!/[\u0e01-\u0e5b]/.test(prose)) return true;
  const words = source.replace(PROTECTED, "").match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g) ?? [];
  const sourcePhrase = words.join(" ").toLowerCase();
  const outputPhrase = (prose.match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g) ?? []).join(" ").toLowerCase();
  if (words.length >= 3 && outputPhrase.includes(sourcePhrase)) return true;
  return /\b(?:[A-Za-z]+(?:[-'][A-Za-z]+)?\s+){4,}[A-Za-z]+\b/.test(prose);
}

/** Exact source fragments suitable for translation, excluding code and technical tokens. */
export function markdownTranslatables(doc: Document): string[] {
  const texts = new Set<string>();
  const add = (text: string) => {
    if (hasMarkdownProse(text)) texts.add(text.trim());
  };
  const visit = (block: Block): void => {
    switch (block.type) {
      case "heading":
      case "text":
        add(block.text);
        break;
      case "list":
        block.items.forEach(add);
        break;
      case "table":
        block.head.forEach(add);
        for (const row of block.rows) row.forEach(add);
        break;
      case "cards":
        block.cards.forEach((card) => {
          add(card.title);
          card.blocks.forEach(visit);
        });
        break;
      case "code":
        break;
    }
  };
  doc.sections.forEach((section) => {
    add(section.title);
    section.blocks.forEach(visit);
  });
  return [...texts];
}

function bilingual(text: string, translations: ReadonlyMap<string, string>): string {
  const thai = translateText(text, translations);
  if (thai === null) return inline(text);
  return `<span class="en">${inline(text)}</span><span class="th" lang="th"><span class="th-tag">Thai translation, not source · คำแปล ไม่ใช่ต้นฉบับ</span>${inline(thai)}</span>`;
}

function renderBlock(block: Block, translations: ReadonlyMap<string, string>): string {
  switch (block.type) {
    case "heading":
      return `<h${block.level}>${bilingual(block.text, translations)}</h${block.level}>`;
    case "text":
      return `<p>${bilingual(block.text, translations)}</p>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${bilingual(item, translations)}</li>`).join("")}</${tag}>`;
    }
    case "table": {
      const head = block.head.map((cell) => `<th>${bilingual(cell, translations)}</th>`).join("");
      const rows = block.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${bilingual(cell, translations)}</td>`).join("")}</tr>`,
        )
        .join("");
      return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case "code":
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case "cards":
      return `<div class="cards">${block.cards
        .map(
          (card) =>
            `<div class="notice"><h3>${bilingual(card.title, translations)}</h3>${card.blocks.map((child) => renderBlock(child, translations)).join("")}</div>`,
        )
        .join("")}</div>`;
  }
}

/** One `<h2>` per section, followed by its blocks. The page script groups the sections into navigation. */
export function renderDocument(
  doc: Document,
  translations: ReadonlyMap<string, string> = new Map(),
): string {
  return doc.sections
    .map((section) => {
      const thai = translateText(section.title, translations);
      const dataTh = thai === null ? "" : ` data-th="${escapeHtml(thai)}"`;
      return `<h2 data-title="${escapeHtml(section.title)}"${dataTh}>${bilingual(section.title, translations)}</h2>\n${section.blocks.map((block) => renderBlock(block, translations)).join("\n")}`;
    })
    .join("\n");
}
