import type { ReviewFiles } from "@/scripts/application/interfaces/review-files";
import type { ReviewState } from "@/scripts/application/services/review-state";
import { ReviewError } from "@/scripts/domain/errors";
import { type LinkMap, renderBody } from "@/scripts/domain/review-html";
import { hashText } from "@/scripts/domain/spec";

export interface BuildSpecBodyInput {
  specPath: string;
  /** Folder with optional `links.json`, `pre.html`, `post.html` and `entities.html`. */
  extrasDir: string | null;
  /** Command shown when Thai lines are missing. */
  translateHint: string;
}

export interface BuildSpecBodyOutput {
  /** Page sections without the page shell. */
  html: string;
  title: string;
  items: number;
  flagged: string[];
  traceability: boolean;
}

function parseLinks(
  json: string,
  requirementIds: ReadonlySet<string>,
  targetIds: ReadonlySet<string>,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ReviewError("links.json is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ReviewError("links.json must be an object of requirement id -> list of ids");
  }
  const links: Record<string, string[]> = {};
  for (const [id, refs] of Object.entries(parsed)) {
    if (!requirementIds.has(id))
      throw new ReviewError(`links.json names unknown requirement '${id}'`);
    if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string")) {
      throw new ReviewError(`links.json entry '${id}' must be a list of strings`);
    }
    for (const ref of refs as string[]) {
      if (!targetIds.has(ref.replace("~", ""))) {
        throw new ReviewError(`links.json entry '${id}' names unknown id '${ref}'`);
      }
    }
    links[id] = refs as string[];
  }
  return links satisfies LinkMap;
}

/** Builds the bilingual sections for one spec. Used by `render` and by `spec` stages. */
export class SpecBody {
  constructor(private readonly deps: { state: ReviewState; files: ReviewFiles }) {}

  async build(input: BuildSpecBodyInput): Promise<BuildSpecBodyOutput> {
    const resolution = await this.deps.state.load(input.specPath);
    if (resolution.missing.length > 0) {
      const ids = resolution.missing.map((item) => item.id).join(", ");
      throw new ReviewError(
        `${resolution.missing.length} items have no Thai line: ${ids}`,
        input.translateHint,
      );
    }
    const { spec } = resolution;
    const extras = async (name: string): Promise<string | null> =>
      input.extrasDir === null
        ? null
        : this.deps.files.readOptionalText(`${input.extrasDir}/${name}`);
    const linksJson = await extras("links.json");
    const requirementIds = new Set(spec.requirements.map((req) => req.id));
    const targetIds = new Set([
      ...spec.stories.flatMap((story) => story.scenarios.map((scenario) => scenario.id)),
      ...spec.criteria.map((criterion) => criterion.id),
    ]);
    const links = linksJson === null ? null : parseLinks(linksJson, requirementIds, targetIds);
    const [pre, post, entitiesHtml] = await Promise.all([
      extras("pre.html"),
      extras("post.html"),
      extras("entities.html"),
    ]);
    const flagged = new Set(resolution.findings.map((finding) => finding.id));
    const html = renderBody({
      spec,
      thai: (text) => resolution.thaiByKey.get(hashText(text)) ?? "",
      flagged,
      links,
      pre: pre === null ? [] : [pre],
      post: post === null ? [] : [post],
      entitiesHtml,
    });
    return {
      html,
      title: spec.title,
      items: resolution.items.length,
      flagged: [...flagged],
      traceability: links !== null,
    };
  }
}
