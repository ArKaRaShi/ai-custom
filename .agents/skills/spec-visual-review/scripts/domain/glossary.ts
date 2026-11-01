/** A Thai line that failed an automatic check and needs a human look. */
export interface Finding {
  id: string;
  key: string;
  reasons: string[];
}

interface RequiredTerm {
  label: string;
  english: RegExp;
  thai: readonly string[];
}

interface ForbiddenRendering {
  label: string;
  english: RegExp;
  unlessEnglish?: RegExp;
  thai: RegExp;
}

const KEPT_VERBATIM: readonly string[] = ["Orca", "Git", "JSON", "CLI", "v2", "ai-sync"];

/** Other correct spellings of a kept name. `v2` is correctly written as version 2 in Thai. */
const ACCEPTED_SPELLINGS: Readonly<Record<string, readonly string[]>> = {
  v2: ["เวอร์ชัน 2", "เวอร์ชั่น 2", "เวอร์ชัน2"],
};

/** Words that read badly in Thai. They stay in English, singular or plural. */
const KEPT_WORDS: readonly string[] = ["agent", "manifest", "remote", "backup"];

const REQUIRED_TERMS: readonly RequiredTerm[] = [
  {
    label: "preview",
    english: /\bpreviews?\b/i,
    thai: ["ตัวอย่าง", "พรีวิว"],
  },
  {
    label: "silently",
    english: /\bsilently\b/i,
    thai: ["เงียบ", "ไม่แจ้ง", "ไม่บอก", "ไม่รายงาน", "ไม่เตือน", "แอบ", "ไม่ได้แจ้ง", "ไม่ได้รายงาน"],
  },
];

const FORBIDDEN_RENDERINGS: readonly ForbiddenRendering[] = [
  {
    label: "'silently' rendered as 'automatically' (โดยอัตโนมัติ)",
    english: /\bsilently\b/i,
    unlessEnglish: /automatic/i,
    thai: /โดยอัตโนมัติ/,
  },
];

/** Thai renderings the model produces for each kept word. They are rewritten to the English word. */
const THAI_FORMS: Readonly<Record<string, RegExp>> = {
  agent: /เอเจนต์|เอเจนท์|เอเยนต์|เอเย่นต์|ตัวแทน|ตัวช่วย/g,
  manifest: /แมนิเฟสต์|มานิเฟสต์|แมนเฟสต์/g,
  remote: /รีโมต|รีโมท|ระยะไกล|ทางไกล/g,
  backup: /การสำรองข้อมูล|สำรองข้อมูล|สำรอง|แบ็กอัพ|แบ็คอัพ|แบคอัพ/g,
};

/** Rewrites known Thai renderings of the kept words to English when the source line uses the word. */
export function keepEnglishWords(english: string, thai: string): string {
  let result = thai;
  for (const word of KEPT_WORDS) {
    const form = THAI_FORMS[word];
    if (!form || !new RegExp(`\\b${word}s?\\b`, "i").test(english)) continue;
    result = result.replace(form, ` ${word} `);
  }
  return result
    .replace(/ {2,}/g, " ")
    .replace(/ ([,.;:)!?])/g, "$1")
    .trim();
}

function keptWordReasons(english: string, thai: string): string[] {
  const lowerThai = thai.toLowerCase();
  return KEPT_WORDS.filter(
    (word) => new RegExp(`\\b${word}s?\\b`, "i").test(english) && !lowerThai.includes(word),
  ).map((word) => `'${word}' not kept in English`);
}

function missingTerm(term: RequiredTerm, english: string, thai: string): string | null {
  if (!term.english.test(english)) return null;
  if (term.thai.some((candidate) => thai.includes(candidate))) return null;
  return `missing Thai term for '${term.label}'`;
}

function modalReasons(english: string, thai: string): string[] {
  const reasons: string[] = [];
  if (/\bMUST NOT\b/.test(english) && !/ไม่|ห้าม/.test(thai)) {
    reasons.push("'MUST NOT' lost its negation");
  }
  if (/\bMUST\b(?! NOT)/.test(english) && !/ต้อง|จำเป็น/.test(thai)) {
    reasons.push("'MUST' lost its obligation");
  }
  return reasons;
}

function preservedReasons(english: string, thai: string): string[] {
  const reasons: string[] = [];
  for (const token of KEPT_VERBATIM) {
    const accepted = ACCEPTED_SPELLINGS[token] ?? [];
    const kept = thai.includes(token) || accepted.some((spelling) => thai.includes(spelling));
    if (english.includes(token) && !kept) reasons.push(`'${token}' not kept`);
  }
  for (const number of english.match(/\b\d+\b/g) ?? []) {
    if (!thai.includes(number)) reasons.push(`number ${number} not kept`);
  }
  return reasons;
}

/** Automatic checks only. They catch lost negation, wrong key terms, and dropped names. */
export function checkThai(id: string, key: string, english: string, thai: string): Finding | null {
  const reasons: string[] = [];
  if (thai.trim() === "") reasons.push("empty translation");
  reasons.push(
    ...modalReasons(english, thai),
    ...preservedReasons(english, thai),
    ...keptWordReasons(english, thai),
  );
  for (const term of REQUIRED_TERMS) {
    const reason = missingTerm(term, english, thai);
    if (reason) reasons.push(reason);
  }
  for (const rule of FORBIDDEN_RENDERINGS) {
    const applies = rule.english.test(english) && !rule.unlessEnglish?.test(english);
    if (applies && rule.thai.test(thai)) reasons.push(rule.label);
  }
  return reasons.length > 0 ? { id, key, reasons } : null;
}
