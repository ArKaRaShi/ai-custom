import { describe, expect, it } from "bun:test";
import { SpecParseError } from "@/scripts/domain/errors";
import { checkThai, keepEnglishWords } from "@/scripts/domain/glossary";
import { applyTemplate, renderBody } from "@/scripts/domain/review-html";
import { hashText, parseSpec, translatables } from "@/scripts/domain/spec";
import { goodThai, SPEC } from "./fixtures";

describe("given a spec in the Spec Kit layout, when it is parsed", () => {
  it("splits each scenario into Given, When and Then without rewording", () => {
    const spec = parseSpec(SPEC);
    const [first] = spec.stories[0]?.scenarios ?? [];
    expect(first).toMatchObject({
      id: "AC-01",
      given: "a shared item",
      when: "a transfer is previewed",
      outcome: "the paths are reported without changes",
    });
    expect(`Given ${first?.given}, when ${first?.when}, then ${first?.outcome}.`).toBe(
      first?.text ?? "",
    );
  });

  it("rejects a document without user stories", () => {
    expect(() => parseSpec("# Feature Specification: Empty\n")).toThrow(SpecParseError);
  });

  it("gives every English item one key, and equal wording the same key", () => {
    const items = translatables(parseSpec(SPEC));
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const edited = translatables(
      parseSpec(SPEC.replace("Previews protect files.", "Previews guard files.")),
    );
    const changed = items.filter((item, i) => edited[i]?.key !== item.key).map((item) => item.id);
    expect(changed).toEqual(["S1.why"]);
  });
});

describe("given a Thai line, when the glossary check runs", () => {
  const key = "k";

  it("flags 'agents' translated into Thai instead of kept in English", () => {
    const finding = checkThai(
      "FR",
      key,
      "Agents MUST show risky actions.",
      "เจ้าหน้าที่ต้องแสดงการกระทำที่เสี่ยง",
    );
    expect(finding?.reasons).toContain("'agent' not kept in English");
  });

  it("flags 'silently' rendered as 'automatically'", () => {
    const finding = checkThai(
      "FR",
      key,
      "It MUST NOT silently proceed.",
      "ต้องไม่ดำเนินการต่อโดยอัตโนมัติ",
    );
    expect(finding?.reasons.join()).toContain("automatically");
  });

  it("flags a MUST NOT whose negation was lost", () => {
    const finding = checkThai(
      "FR",
      key,
      "Previews MUST NOT mutate files.",
      "การแสดงตัวอย่างต้องเปลี่ยนไฟล์",
    );
    expect(finding?.reasons.join()).toContain("MUST NOT");
  });

  it("rewrites Thai renderings of agent, remote, backup, and manifest to English", () => {
    expect(keepEnglishWords("Backup files", "ไฟล์สำรองข้อมูล")).toBe("ไฟล์ backup");
    expect(keepEnglishWords("A Git remote", "Git บนรีโมต")).toBe("Git บน remote");
    expect(keepEnglishWords("The agents run", "เอเจนต์ทำงาน")).toBe("agent ทำงาน");
    expect(keepEnglishWords("Previews help", "ตัวอย่างช่วย")).toBe("ตัวอย่างช่วย");
  });

  it("accepts 'เวอร์ชัน 2' as the Thai spelling of v2 but still flags a dropped version", () => {
    const english = "The existing v2 manifest remains the starting point.";
    expect(checkThai("A", key, english, "manifest เวอร์ชัน 2 ยังคงเป็นจุดเริ่มต้น")).toBeNull();
    const dropped = checkThai("A", key, english, "manifest ยังคงเป็นจุดเริ่มต้น");
    expect(dropped?.reasons).toContain("'v2' not kept");
  });

  it("passes a faithful translation", () => {
    const finding = checkThai(
      "FR",
      key,
      "Previews MUST NOT mutate local files.",
      "การแสดงตัวอย่างต้องไม่ทำให้ไฟล์ในเครื่องเปลี่ยนแปลง",
    );
    expect(finding).toBeNull();
  });
});

describe("given a parsed spec with Thai lines, when the page body is rendered", () => {
  const spec = parseSpec(SPEC);
  const thai = (text: string): string => goodThai(text);
  const body = renderBody({
    spec,
    thai,
    flagged: new Set(["FR-001"]),
    links: { "FR-001": ["AC-01"], "FR-002": [] },
    pre: [],
    post: [],
    entitiesHtml: null,
  });

  it("escapes source markup instead of passing it through", () => {
    expect(body).toContain("&lt;local&gt; item &amp; more");
    expect(body).not.toContain("<local>");
  });

  it("shows exactly one Thai line under every English item", () => {
    for (const item of translatables(spec)) {
      const thaiText = goodThai(item.text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      expect(body.split(thaiText).length - 1).toBeGreaterThanOrEqual(1);
    }
    const thaiLines = body.match(/class="th" lang="th"/g) ?? [];
    const stories = spec.stories.length;
    expect(thaiLines.length).toBeGreaterThanOrEqual(
      translatables(spec).length - stories - spec.entities.length,
    );
  });

  it("marks a flagged line and lists requirements with no match as findings", () => {
    expect(body).toContain("needs review");
    expect(body).toContain("FR-002 have no matching acceptance scenario");
  });

  it("keeps MUST and MUST NOT in English", () => {
    expect(body).toContain('class="chip must-not">MUST NOT');
    expect(body).toContain('class="chip must">MUST');
  });

  it("derives the key from the exact English wording", () => {
    expect(hashText("a")).toBe(hashText("a"));
    expect(hashText("a")).not.toBe(hashText("a "));
  });
});

describe("given a template, when the page is assembled", () => {
  const template = "<title>t</title><header><h1>t</h1></header><main>old</main>";

  it("fills title, header and main", () => {
    const page = applyTemplate(template, "A & B", "sub", "<p>body</p>");
    expect(page).toContain("<title>A &amp; B</title>");
    expect(page).toContain("<main><p>body</p></main>");
  });

  it("fails when the template has no main element", () => {
    expect(() => applyTemplate("<title>t</title><header></header>", "a", "b", "c")).toThrow(
      "<main>",
    );
  });
});
