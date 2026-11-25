import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { checkStandard } from "../shared/standards";
import { error, resetOnSessionChange, sessionOnce, warn, type HookMeta } from "../shared/verdict";

export const HOOK_META = {
  id: "standards-doc",
  category: "ERROR",
  events: ["tool_call", "tool_result", "session_start", "session_clear"],
  standards: [".agents/standards/authoring-standards.md"],
} satisfies HookMeta;

// README.md is the catalog, not a standard; it is checked by the index test instead.
const STANDARD_FILE = /(^|\/)\.agents\/standards\/(?!README\.md$)[^/]+\.md$/;
const home = os.homedir();
const template = `${home}/.agents/standards/authoring-standards.md`;

function firstProblem(file: string): string | undefined {
  const text = fs.readFileSync(file, "utf8");
  const findings = checkStandard(text, { home, exists: (target) => fs.existsSync(target) });
  const first = findings[0];
  if (!first) return undefined;
  return `${first.rule}: ${first.detail}. ${first.fix}`;
}

export default function standardsDoc(pi: HookAPI): void {
  const once = sessionOnce();
  resetOnSessionChange(pi, once);

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "write") return;
    const file = String(event.input?.path ?? "");
    if (!STANDARD_FILE.test(file)) return;
    const content = String(event.input?.content ?? "");
    const findings = checkStandard(content, { home, exists: (target) => fs.existsSync(target) });
    const first = findings[0];
    if (!first) return;
    return error(HOOK_META, `standard ${path.basename(file)} breaks the template — ${first.rule}: ${first.detail}`, `copy the template from ${template} and ${first.fix}`);
  });

  // An edit only carries the replacement text, so the whole file is checked after it lands.
  pi.on("tool_result", async (event) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    if (event.isError) return;
    const file = String(event.input?.path ?? "");
    if (!STANDARD_FILE.test(file) || !fs.existsSync(file)) return;
    const problem = firstProblem(file);
    if (!problem) return;
    if (!once.take(`${file}:${problem}`)) return;
    return warn(HOOK_META, `${path.basename(file)} no longer matches the template — ${problem}`);
  });
}
