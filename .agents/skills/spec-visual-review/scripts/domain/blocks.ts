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

function renderBlock(block: Block): string {
  switch (block.type) {
    case "heading":
      return `<h${block.level}>${inline(block.text)}</h${block.level}>`;
    case "text":
      return `<p>${inline(block.text)}</p>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
    }
    case "table": {
      const head = block.head.map((cell) => `<th>${inline(cell)}</th>`).join("");
      const rows = block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
        .join("");
      return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case "code":
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case "cards":
      return `<div class="cards">${block.cards
        .map(
          (card) =>
            `<div class="notice"><h3>${inline(card.title)}</h3>${card.blocks.map(renderBlock).join("")}</div>`,
        )
        .join("")}</div>`;
  }
}

/** One `<h2>` per section, followed by its blocks. The page script groups the sections into navigation. */
export function renderDocument(doc: Document): string {
  return doc.sections
    .map(
      (section) =>
        `<h2 data-title="${escapeHtml(section.title)}">${escapeHtml(section.title)}</h2>\n${section.blocks.map(renderBlock).join("\n")}`,
    )
    .join("\n");
}
