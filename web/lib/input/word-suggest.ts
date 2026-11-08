/**
 * Word suggestions for the letter board (ROADMAP Phase 4). Personal first:
 * the resident's own tile labels, then a small core AAC vocabulary.
 * Suggestions are offered, never inserted or spoken automatically.
 */

const CORE_WORDS = [
  "yes", "no", "please", "thanks", "help", "more", "stop", "want", "go",
  "see", "eat", "drink", "home", "outside", "tired", "happy", "sad",
  "now", "later", "today", "tomorrow", "music", "quiet", "walk", "phone",
];

export function buildVocabulary(tileLabels: string[], extraWords: string[] = []): string[] {
  const seen = new Set<string>();
  const vocabulary: string[] = [];
  for (const word of [...tileLabels, ...extraWords, ...CORE_WORDS]) {
    const cleaned = word.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    vocabulary.push(cleaned);
  }
  return vocabulary;
}

/**
 * Up to `limit` suggestions for the letters typed so far. Personal words
 * (earlier in the vocabulary) win ties; prefix matches beat contains.
 */
export function suggestWords(prefix: string, vocabulary: string[], limit = 4): string[] {
  const needle = prefix.trim().toLowerCase();
  if (!needle) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const word of vocabulary) {
    if (word === needle) continue;
    if (word.startsWith(needle)) starts.push(word);
    else if (needle.length >= 2 && word.includes(needle)) contains.push(word);
  }
  return [...starts, ...contains].slice(0, limit);
}
