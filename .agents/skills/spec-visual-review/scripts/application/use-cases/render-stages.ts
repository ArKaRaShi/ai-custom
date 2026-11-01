import * as path from "node:path";
import type { ReviewFiles } from "@/scripts/application/interfaces/review-files";
import type { StageFormats } from "@/scripts/application/interfaces/stage-formats";
import { renderDocument } from "@/scripts/domain/blocks";
import { applyStages, type StagePanel } from "@/scripts/domain/stage-page";
import { type StageEntry, type StageState, sha256, stageStates } from "@/scripts/domain/stages";

export interface RenderStagesInput {
  manifestPath: string;
  templatePath: string;
  outPath: string;
  apply: boolean;
}

export interface RenderStagesOutput {
  applied: boolean;
  outPath: string;
  bytes: number;
  stages: Array<{ id: string; label: string; state: StageState }>;
  /** Approved stages whose source hash was (or would be) recorded in stages.json. */
  pinned: string[];
}

/** Builds the Thai-capable body for a `spec` stage. Injected so this use case stays free of Thai state. */
export type SpecBody = (specPath: string) => Promise<{ html: string }>;

const MISSING_HTML =
  '<h2 data-title="Status">Status</h2>\n<p>This stage has no source file yet. It is created after the previous stage is approved.</p>';

/** Builds one read-only page that keeps every stage. Previews by default and writes only with `apply`. */
export class RenderStages {
  constructor(
    private readonly deps: { files: ReviewFiles; formats: StageFormats; specBody: SpecBody },
  ) {}

  private async body(entry: StageEntry, sourcePath: string, text: string): Promise<string> {
    if (entry.kind === "spec") return (await this.deps.specBody(sourcePath)).html;
    const override = await this.deps.files.readOptionalText(`${sourcePath}.blocks.json`);
    const { formats } = this.deps;
    return renderDocument(
      override === null ? formats.markdownToDocument(text) : formats.parseDocument(override),
    );
  }

  async execute(input: RenderStagesInput): Promise<RenderStagesOutput> {
    const { files } = this.deps;
    const manifest = this.deps.formats.parseManifest(await files.readText(input.manifestPath));
    const dir = path.dirname(input.manifestPath);
    const sources = await Promise.all(
      manifest.stages.map(async (entry) => {
        const sourcePath = path.resolve(dir, entry.source);
        return { entry, sourcePath, text: await files.readOptionalText(sourcePath) };
      }),
    );
    const shaBySource = new Map(
      sources.map(
        ({ entry, text }) => [entry.source, text === null ? null : sha256(text)] as const,
      ),
    );
    const statuses = stageStates(manifest.stages, shaBySource);
    const panels: StagePanel[] = [];
    for (const [index, { entry, sourcePath, text }] of sources.entries()) {
      const status = statuses[index];
      if (!status) continue;
      const html = text === null ? MISSING_HTML : await this.body(entry, sourcePath, text);
      panels.push({ status, html, ...(entry.approved ? { approved: entry.approved } : {}) });
    }
    const template = await files.readText(input.templatePath);
    const page = applyStages(
      template,
      manifest.title,
      "Read-only review. Reply in the terminal.",
      panels,
    );

    const pinned: string[] = [];
    for (const { entry } of sources) {
      const sha = shaBySource.get(entry.source);
      if (entry.approved && entry.approvedSha256 === undefined && sha) {
        entry.approvedSha256 = sha;
        pinned.push(entry.id);
      }
    }
    if (input.apply) {
      await files.writeText(input.outPath, page);
      if (pinned.length > 0) {
        await files.writeText(input.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }
    }
    return {
      applied: input.apply,
      outPath: input.outPath,
      bytes: new TextEncoder().encode(page).length,
      stages: statuses.map(({ id, label, state }) => ({ id, label, state })),
      pinned,
    };
  }
}
