export interface TokenDensityReport {
  wordCount: number;
  estimatedTokens: number;
  charCount: number;
  fillerMatches: Array<{ phrase: string; line: number }>;
  densityRating: "High (Compact)" | "Moderate" | "Low (Verbose/Bloat)";
}

// Common conversational filler & low-density throat-clearing phrases
const FILLER_PATTERNS = [
  /it is worth noting that/i,
  /it should be noted that/i,
  /let'?s dive in/i,
  /in order to/i,
  /as previously mentioned/i,
  /at the end of the day/i,
  /first and foremost/i,
  /needless to say/i,
  /for the purpose of/i,
  /in the event that/i,
  /with that being said/i,
  /due to the fact that/i,
];

/**
 * Evaluates token density, word count, estimated token usage, and conversational bloat.
 */
export function analyzeTokenDensity(content: string): TokenDensityReport {
  const lines = content.split("\n");
  const charCount = content.length;

  const words = content.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Approximate tokens: standard OpenAI/Anthropic/Gemini heuristic (~4 chars/token or 0.75 words/token)
  const estimatedTokens = Math.ceil(charCount / 3.8);

  const fillerMatches: Array<{ phrase: string; line: number }> = [];

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
  }

  let densityRating: "High (Compact)" | "Moderate" | "Low (Verbose/Bloat)" = "High (Compact)";
  if (fillerMatches.length >= 3 || (wordCount > 1000 && charCount / Math.max(1, wordCount) > 8)) {
    densityRating = "Low (Verbose/Bloat)";
  } else if (fillerMatches.length > 0) {
    densityRating = "Moderate";
  }

  return {
    wordCount,
    estimatedTokens,
    charCount,
    fillerMatches,
    densityRating,
  };
}
