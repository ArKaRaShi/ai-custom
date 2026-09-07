export interface TokenDensityReport {
  wordCount: number;
  estimatedTokens: number;
  charCount: number;
  fillerMatches: Array<{ phrase: string; line: number }>;
  condescendingMatches: Array<{ phrase: string; line: number }>;
  densityRating: "High (Compact)" | "Moderate" | "Low (Verbose/Bloat)";
}

// Common conversational filler & low-density throat-clearing phrases
const FILLER_PATTERNS = [
  /\bit is worth noting that\b/i,
  /\bit should be noted that\b/i,
  /\blet'?s dive in\b/i,
  /\bin order to\b/i,
  /\bas previously mentioned\b/i,
  /\bat the end of the day\b/i,
  /\bfirst and foremost\b/i,
  /\bneedless to say\b/i,
  /\bfor the purpose of\b/i,
  /\bin the event that\b/i,
  /\bwith that being said\b/i,
  /\bdue to the fact that\b/i,
];

// Presumptuous / Condescending words that obscure technical difficulty
const CONDESCENDING_PATTERNS = [
  /\bsimply\b/i,
  /\bjust\s+(?:run|do|use|copy|click|paste|add|change)\b/i,
  /\bobviously\b/i,
  /\bclearly\b/i,
  /\beasy\s+to\b/i,
  /\bas everyone knows\b/i,
  /\bit is obvious that\b/i,
];

/**
 * Evaluates token density, word count, estimated token usage, and condescending words.
 */
export function analyzeTokenDensity(content: string): TokenDensityReport {
  const lines = content.split("\n");
  const charCount = content.length;

  const words = content.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Approximate tokens: standard OpenAI/Anthropic/Gemini heuristic (~3.8 chars/token)
  const estimatedTokens = Math.ceil(charCount / 3.8);

  const fillerMatches: Array<{ phrase: string; line: number }> = [];
  const condescendingMatches: Array<{ phrase: string; line: number }> = [];

  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    for (const pattern of FILLER_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        fillerMatches.push({
          phrase: match[0],
          line: i + 1,
        });
      }
    }

    for (const pattern of CONDESCENDING_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        condescendingMatches.push({
          phrase: match[0],
          line: i + 1,
        });
      }
    }
  }

  let densityRating: "High (Compact)" | "Moderate" | "Low (Verbose/Bloat)" = "High (Compact)";
  if (
    fillerMatches.length + condescendingMatches.length >= 3 ||
    (wordCount > 1000 && charCount / Math.max(1, wordCount) > 8)
  ) {
    densityRating = "Low (Verbose/Bloat)";
  } else if (fillerMatches.length + condescendingMatches.length > 0) {
    densityRating = "Moderate";
  }

  return {
    wordCount,
    estimatedTokens,
    charCount,
    fillerMatches,
    condescendingMatches,
    densityRating,
  };
}
