import { HOOK_CATEGORIES } from "./verdict";

// A standard is a contract other harnesses enforce. These checks keep every standard
// file in one shape, so an agent can find the rule, the adapter, and the gap the same
// way in every file. Pure: the caller supplies the filesystem it wants checked.

export interface StandardFinding {
  rule: string;
  detail: string;
  fix: string;
}

export interface StandardContext {
  home: string;
  exists(path: string): boolean;
}

const MAX_LINES = 150;
const ENFORCED_HEADING = "## Enforced by";
const REQUIRED_COLUMNS = ["Harness", "Adapter", "Category"];

function sectionLines(lines: string[], heading: string): string[] | undefined {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

// A standard shows its own template inside a fence; examples must not be validated as rows.
function withoutFences(lines: string[]): string[] {
  const visible: string[] = [];
  let fenced = false;
  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) visible.push(line);
  }
  return visible;
}

function tableRows(section: string[]): string[][] {
  const rows = section.filter((line) => line.trim().startsWith("|"));
  return rows.map((row) =>
    row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  );
}

function adapterPath(adapter: string, context: StandardContext): string | StandardFinding {
  if (adapter.startsWith("~/")) return `${context.home}/${adapter.slice(2)}`;
  if (adapter.startsWith("/")) return adapter;
  return { rule: "adapter", detail: `adapter "${adapter}" is neither absolute nor ~-rooted`, fix: "write the full path" };
}

/** Report every way a standard file departs from the template. */
export function checkStandard(text: string, context: StandardContext): StandardFinding[] {
  const findings: StandardFinding[] = [];
  const lines = text.split("\n");
  const visible = withoutFences(lines);

  const firstLine = lines.find((line) => line.trim().length > 0) ?? "";
  if (!/^# \S/.test(firstLine)) {
    findings.push({ rule: "title", detail: "the file does not start with a title", fix: "start with '# <topic>'" });
  }

  const headings = visible.map((line, index) => ({ line, index })).filter((entry) => entry.line.startsWith("## "));
  if (headings.length < 2) {
    findings.push({ rule: "sections", detail: "there is no rule section besides the enforcement table", fix: "add '## <rule>' sections above '## Enforced by'" });
  }

  const firstHeading = headings.length > 0 ? headings[0].index : visible.length;
  const scope = visible.slice(1, firstHeading).join(" ").trim();
  if (scope.length < 20) {
    findings.push({ rule: "scope", detail: "no sentence says what this standard applies to", fix: "add one sentence under the title" });
  }

  const enforced = sectionLines(visible, ENFORCED_HEADING);
  if (!enforced) {
    findings.push({ rule: "enforced", detail: "the '## Enforced by' section is missing", fix: `add '${ENFORCED_HEADING}' with the harness table` });
  } else {
    const rows = tableRows(enforced);
    const header = rows[0] ?? [];
    const complete = REQUIRED_COLUMNS.every((column) => header.includes(column));
    if (!complete) {
      findings.push({ rule: "enforced", detail: `the table header is not ${REQUIRED_COLUMNS.join(" | ")}`, fix: "use the template header" });
    }
    const dataRows = rows.slice(2);
    if (dataRows.length === 0) {
      findings.push({ rule: "enforced", detail: "the table names no harness", fix: "add one row per harness, with a dash when there is no adapter" });
    }
    for (const row of dataRows) {
      const adapter = row[1] ?? "";
      const category = row[2] ?? "";
      if (category !== "" && category !== "—" && category !== "-" && !(category in HOOK_CATEGORIES)) {
        findings.push({ rule: "category", detail: `"${category}" is not a hook category`, fix: `use one of ${Object.keys(HOOK_CATEGORIES).join(", ")}` });
      }
      if (adapter === "" || adapter === "—" || adapter === "-") continue;
      const resolved = adapterPath(adapter, context);
      if (typeof resolved !== "string") {
        findings.push(resolved);
      } else if (!context.exists(resolved)) {
        findings.push({ rule: "adapter", detail: `adapter ${adapter} does not exist`, fix: "point the row at the hook or test that enforces this standard" });
      }
    }
  }

  if (lines.length > MAX_LINES) {
    findings.push({ rule: "budget", detail: `${lines.length} lines exceeds ${MAX_LINES}`, fix: "split the topic or cut the example" });
  }

  return findings;
}
