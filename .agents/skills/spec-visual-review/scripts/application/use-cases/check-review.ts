import type { ReviewState } from "@/scripts/application/services/review-state";
import type { Finding } from "@/scripts/domain/glossary";

export interface CheckReviewInput {
  specPath: string;
}

export interface CheckReviewOutput {
  /** `incomplete` when any English item has no Thai line. Flagged lines do not fail the check. */
  status: "complete" | "incomplete";
  total: number;
  overrides: number;
  missing: string[];
  findings: Finding[];
}

export class CheckReview {
  constructor(private readonly deps: { state: ReviewState }) {}

  async execute(input: CheckReviewInput): Promise<CheckReviewOutput> {
    const resolution = await this.deps.state.load(input.specPath);
    const keys = new Set(resolution.items.map((item) => item.key));
    const overrides = Object.keys(resolution.records.overrides).filter((k) => keys.has(k)).length;
    return {
      status: resolution.missing.length === 0 ? "complete" : "incomplete",
      total: resolution.items.length,
      overrides,
      missing: resolution.missing.map((item) => item.id),
      findings: resolution.findings,
    };
  }
}
