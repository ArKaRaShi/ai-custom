/*
 * Just enough CSS reading for the tests that guard components.css. The file is plain
 * hand-written CSS with no nesting (a test enforces that), so a rule is a prelude, a body and
 * the chain of `@layer` blocks around it. Comments are removed first: a comment that spells
 * out a selector must never be mistaken for the real one.
 */

export interface CssRule {
  /** `vc.frame`, `vc.components`...; null when the rule sits outside every layer. */
  readonly layer: string | null;
  readonly selector: string;
  readonly body: string;
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export interface ParsedCss {
  readonly rules: readonly CssRule[];
  /** Rules whose body contains another block: CSS nesting, which the tests forbid. */
  readonly nested: readonly string[];
}

export function parseCss(source: string): ParsedCss {
  const css = stripComments(source);
  const rules: CssRule[] = [];
  const nested: string[] = [];
  const blocks: { readonly kind: "layer" | "at"; readonly name: string }[] = [];
  let prelude = "";

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === ";") {
      prelude = "";
    } else if (ch === "}") {
      blocks.pop();
      prelude = "";
    } else if (ch === "{") {
      const head = prelude.trim();
      prelude = "";
      if (head.startsWith("@layer")) {
        blocks.push({ kind: "layer", name: head.slice(6).trim() });
      } else if (head.startsWith("@")) {
        blocks.push({ kind: "at", name: head });
      } else {
        const end = css.indexOf("}", i);
        const body = css.slice(i + 1, end);
        if (body.includes("{")) nested.push(head);
        const layers = blocks.filter((block) => block.kind === "layer").map((block) => block.name);
        rules.push({ layer: layers.length > 0 ? layers.join(".") : null, selector: head, body });
        i = end;
      }
    } else {
      prelude += ch;
    }
  }
  return { rules, nested };
}

/** Top-level comma-separated parts of a selector list, ignoring commas inside parentheses and brackets. */
export function splitSelectors(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
