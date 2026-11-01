import type { ReviewFiles } from "@/scripts/application/interfaces/review-files";
import type { ReviewState } from "@/scripts/application/services/review-state";
import { SpecBody } from "@/scripts/application/services/spec-body";
import { applyTemplate } from "@/scripts/domain/review-html";

export interface RenderReviewInput {
  specPath: string;
  templatePath: string;
  outPath: string;
  /** Folder with optional `links.json`, `pre.html`, `post.html` and `entities.html`. */
  extrasDir: string | null;
  apply: boolean;
  /** Command shown when Thai lines are missing. */
  translateHint: string;
}

export interface RenderReviewOutput {
  applied: boolean;
  outPath: string;
  bytes: number;
  items: number;
  flagged: string[];
  traceability: boolean;
}

/** Builds the bilingual review page. Previews by default and writes only with `apply`. */
export class RenderReview {
  private readonly body: SpecBody;

  constructor(private readonly deps: { state: ReviewState; files: ReviewFiles }) {
    this.body = new SpecBody(deps);
  }

  async execute(input: RenderReviewInput): Promise<RenderReviewOutput> {
    const built = await this.body.build(input);
    const template = await this.deps.files.readText(input.templatePath);
    const subtitle = `Draft for review · source: ${input.specPath}`;
    const page = applyTemplate(template, built.title, subtitle, built.html);
    if (input.apply) await this.deps.files.writeText(input.outPath, page);
    const { items, flagged, traceability } = built;
    return {
      applied: input.apply,
      outPath: input.outPath,
      bytes: new TextEncoder().encode(page).length,
      items,
      flagged,
      traceability,
    };
  }
}
