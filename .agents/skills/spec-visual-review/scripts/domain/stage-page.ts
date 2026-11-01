import { ReviewError } from "./errors";
import { escapeHtml } from "./review-html";
import type { StageState, StageStatus } from "./stages";

export interface StagePanel {
  status: StageStatus;
  /** Approval date shown under the stage name, when the stage is approved. */
  approved?: string;
  /** Section HTML: `<h2>` headings followed by their content. */
  html: string;
}

const MARKS: Readonly<Record<StageState, string>> = {
  approved: "✓",
  changed: "!",
  draft: "●",
  missing: "○",
};

function caption(panel: StagePanel): string {
  const { state } = panel.status;
  if (state === "approved") return `Approved${panel.approved ? ` ${panel.approved}` : ""}`;
  if (state === "changed") return "Changed after approval";
  if (state === "draft") return "Draft";
  return "Not created yet";
}

/** One button per stage, in order. Reached stages stay on the rail. */
export function renderRail(panels: readonly StagePanel[]): string {
  const buttons = panels
    .map((panel, index) => {
      const { id, label, state } = panel.status;
      return `<button type="button" class="stage state-${state}" data-stage="${escapeHtml(id)}" data-label="${escapeHtml(label)}"><span class="mark" aria-hidden="true">${MARKS[state]}</span><b>${index + 1} ${escapeHtml(label)}</b><small>${escapeHtml(caption(panel))}</small></button>`;
    })
    .join("");
  return `<nav class="stage-rail" aria-label="Review stages">${buttons}</nav>`;
}

function renderPanel(panel: StagePanel): string {
  const banners = panel.status.notes
    .filter((note) => panel.status.state !== "missing" || note !== "Not created yet.")
    .map((note) => `<div class="notice stale">${escapeHtml(note)}</div>`)
    .join("");
  return `<main data-stage="${escapeHtml(panel.status.id)}">${banners}${panel.html}</main>`;
}

/** Puts the title, rail and one `<main>` per stage into the template. */
export function applyStages(
  template: string,
  title: string,
  subtitle: string,
  panels: readonly StagePanel[],
): string {
  const slots: ReadonlyArray<readonly [string, RegExp, string]> = [
    ["<title>", /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`],
    [
      "<header>",
      /<header>[\s\S]*?<\/header>/,
      `<header><h1>${escapeHtml(title)}</h1><p class="subtitle">${escapeHtml(subtitle)}</p>${renderRail(panels)}</header>`,
    ],
    ["<main>", /<main>[\s\S]*?<\/main>/, panels.map(renderPanel).join("\n")],
  ];
  let page = template;
  for (const [name, pattern, html] of slots) {
    if (!pattern.test(page)) throw new ReviewError(`Template has no ${name} element`);
    page = page.replace(pattern, () => html);
  }
  return page;
}
