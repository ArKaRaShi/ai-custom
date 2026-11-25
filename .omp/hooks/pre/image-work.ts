import * as path from "path";
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { advisory, error, resetOnSessionChange, sessionOnce, type HookMeta, type Verdict } from "../shared/verdict";

export const HOOK_META = {
  id: "image-work",
  category: "ERROR",
  events: ["tool_call", "tool_result", "session_start", "session_clear"],
  standards: [".agents/standards/working-with-image.md"],
} satisfies HookMeta;

const IMAGE_STANDARD = `${process.env.HOME ?? "~"}/.agents/standards/working-with-image.md`;

const RASTER = /\.(png|jpe?g|webp|gif|bmp|tiff?|heic)(:|\b)/i;
const RASTER_SELECTOR = /\.(png|jpe?g|webp|gif|bmp|tiff?|heic):(img|raw)\b/i;
const IMAGE_TOOLS = /^(sips|magick|convert|tesseract|qlmanage|screencapture|ffmpeg|exiftool)$/;
const IMAGE_CODE = /\b(PIL|Image\.open|getpixel|findContours|cv2|tab\.screenshot|screenshot\()/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export default function imageWork(pi: HookAPI): void {
  const once = sessionOnce();
  resetOnSessionChange(pi, once);

  const point = (): Verdict | undefined => {
    if (!once.take("image-work")) return undefined;
    return advisory(HOOK_META, `image work follows ${IMAGE_STANDARD}: a delivered image is resampled and may be lossy, so measure the file or crop a new path`);
  };

  pi.on("tool_call", async (event) => {
    const record = asRecord(event);
    const toolName = String(record.toolName ?? "");
    const input = asRecord(record.input);

    if (toolName === "read") {
      const file = String(input.path ?? "");
      if (!RASTER.test(file)) return;
      const selector = file.match(RASTER_SELECTOR);
      if (selector) {
        const plain = file.replace(/:(img|raw)$/, "");
        return error(HOOK_META, `raster image ${path.basename(plain)} rejects the ${selector[2]} selector`, `read "${plain}"`);
      }
      return point();
    }

    if (toolName === "bash") {
      const command = String(input.command ?? "");
      const [first = ""] = command.trim().split(/\s+/);
      if (!IMAGE_TOOLS.test(first) && !RASTER.test(command)) return;
      return point();
    }

    if (toolName === "eval") {
      const code = String(input.code ?? "");
      if (!IMAGE_CODE.test(code)) return;
      return point();
    }

    if (toolName === "browser") return point();
    return undefined;
  });

  // A failed read is exactly where a pointer helps: the file was not where the agent thought.
  pi.on("tool_result", async (event) => {
    const record = asRecord(event);
    if (String(record.toolName ?? "") !== "read" || record.isError !== true) return;
    const file = String(asRecord(record.input).path ?? "");
    if (!RASTER.test(file)) return;
    if (!once.take(`missing:${file}`)) return;
    return advisory(HOOK_META, `${file} could not be read; check the path exists before relying on it, and see ${IMAGE_STANDARD}`);
  });
}
