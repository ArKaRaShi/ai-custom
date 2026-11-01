import { createHash } from "node:crypto";
import { SpecParseError } from "./errors";

export interface Scenario {
  id: string;
  text: string;
  given: string;
  when: string;
  outcome: string;
}

export interface Story {
  title: string;
  intro: string;
  why: string;
  test: string;
  scenarios: Scenario[];
}

export interface Item {
  id: string;
  text: string;
}

export interface ParsedSpec {
  title: string;
  stories: Story[];
  edgeCases: string[];
  requirements: Item[];
  entities: Item[];
  criteria: Item[];
  assumptions: string[];
}

/** One English source string that receives a Thai line. `key` identifies its exact wording. */
export interface Translatable {
  id: string;
  text: string;
  key: string;
}

const BOLD_ITEM = /^\*\*(.+?)\*\*: (.*)$/;
const SCENARIO = /^\d+\. \*\*(AC-\d+)\*\*: (.*)$/;
const GIVEN_WHEN_THEN = /^Given (.+?), when (.+?), then (.+)\.$/;

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function sectionLines(lines: readonly string[], start: string, end: string | null): string[] {
  const from = lines.findIndex((line) => line.startsWith(start));
  if (from < 0) throw new SpecParseError(`Missing section '${start}'`);
  const to =
    end === null ? lines.length : lines.findIndex((line, i) => i > from && line.startsWith(end));
  if (to < 0) throw new SpecParseError(`Missing section '${end}' after '${start}'`);
  return lines.slice(from + 1, to);
}

function bullets(lines: readonly string[]): string[] {
  return lines.filter((line) => line.startsWith("- ")).map((line) => line.slice(2));
}

function boldItems(lines: readonly string[], section: string): Item[] {
  return bullets(lines).map((bullet) => {
    const match = BOLD_ITEM.exec(bullet);
    if (!match) throw new SpecParseError(`Unlabelled item in '${section}': ${bullet}`);
    return { id: match[1] ?? "", text: match[2] ?? "" };
  });
}

function parseScenario(id: string, text: string): Scenario {
  const parts = GIVEN_WHEN_THEN.exec(text);
  const given = parts?.[1] ?? "";
  const when = parts?.[2] ?? "";
  const outcome = parts?.[3] ?? "";
  if (!parts || `Given ${given}, when ${when}, then ${outcome}.` !== text) {
    throw new SpecParseError(`Scenario ${id} is not a single Given/When/Then sentence`);
  }
  return { id, text, given, when, outcome };
}

function parseStories(lines: readonly string[]): Story[] {
  const stories: Story[] = [];
  let current: Story | undefined;
  for (const line of sectionLines(lines, "## User Scenarios", "### Edge Cases")) {
    const heading = /^### (User Story .*)$/.exec(line);
    const why = /^\*\*Why this priority\*\*: (.*)$/.exec(line);
    const test = /^\*\*Independent test\*\*: (.*)$/.exec(line);
    const scenario = SCENARIO.exec(line);
    if (heading) {
      current = { title: heading[1] ?? "", intro: "", why: "", test: "", scenarios: [] };
      stories.push(current);
    } else if (current) {
      if (why) current.why = why[1] ?? "";
      else if (test) current.test = test[1] ?? "";
      else if (scenario) {
        current.scenarios.push(parseScenario(scenario[1] ?? "", scenario[2] ?? ""));
      } else if (line.trim() && !line.startsWith("**") && !current.intro) {
        current.intro = line.trim();
      }
    }
  }
  return stories;
}

export function parseSpec(markdown: string): ParsedSpec {
  const lines = markdown.split("\n");
  const title = /^# Feature Specification: (.+)$/m.exec(markdown)?.[1];
  if (!title) throw new SpecParseError("Missing '# Feature Specification: <name>' title");
  const spec: ParsedSpec = {
    title,
    stories: parseStories(lines),
    edgeCases: bullets(sectionLines(lines, "### Edge Cases", "## Requirements")),
    requirements: boldItems(
      sectionLines(lines, "### Functional Requirements", "### Key Entities"),
      "Functional Requirements",
    ),
    entities: boldItems(
      sectionLines(lines, "### Key Entities", "## Success Criteria"),
      "Key Entities",
    ),
    criteria: boldItems(
      sectionLines(lines, "### Measurable Outcomes", "## Assumptions"),
      "Measurable Outcomes",
    ),
    assumptions: bullets(sectionLines(lines, "## Assumptions", null)),
  };
  if (spec.stories.length === 0) throw new SpecParseError("No '### User Story' sections found");
  return spec;
}

/** Every English source string that must have exactly one Thai line, in page order. */
export function translatables(spec: ParsedSpec): Translatable[] {
  const items: Array<{ id: string; text: string }> = [];
  for (const [index, story] of spec.stories.entries()) {
    const prefix = `S${index + 1}`;
    items.push({ id: `${prefix}.title`, text: story.title });
    items.push({ id: `${prefix}.intro`, text: story.intro });
    items.push({ id: `${prefix}.why`, text: story.why });
    items.push({ id: `${prefix}.test`, text: story.test });
    for (const scenario of story.scenarios) items.push({ id: scenario.id, text: scenario.text });
  }
  for (const [index, text] of spec.edgeCases.entries())
    items.push({ id: `EDGE-${index + 1}`, text });
  for (const item of spec.requirements) items.push(item);
  for (const item of spec.entities) {
    items.push({ id: `ENT:${item.id}`, text: item.text });
    items.push({ id: `ENTNAME:${item.id}`, text: item.id });
  }
  for (const item of spec.criteria) items.push(item);
  for (const [index, text] of spec.assumptions.entries())
    items.push({ id: `ASM-${index + 1}`, text });
  return items.map((item) => ({ ...item, key: hashText(item.text) }));
}
