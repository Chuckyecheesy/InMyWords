/** A spoken line stays short. Three tiles still fit in one sentence. */

export const MAX_SENTENCE_TILES = 3;

const ANSWERS = new Set(["yes", "no"]);

type TileLike = { id: string; label: string };

export function isAnswerLabel(label: string): boolean {
  return ANSWERS.has(label.trim().toLowerCase());
}

export function nextSelection<T extends TileLike>(
  current: T[],
  tile: T,
): { tiles: T[]; note: string | null } {
  if (current.some((item) => item.id === tile.id)) {
    return { tiles: current.filter((item) => item.id !== tile.id), note: null };
  }
  const withoutOtherAnswer = isAnswerLabel(tile.label)
    ? current.filter((item) => !isAnswerLabel(item.label))
    : current;
  if (withoutOtherAnswer.length >= MAX_SENTENCE_TILES) {
    return {
      tiles: current,
      note: "A sentence uses three tiles. Take one off to add another.",
    };
  }
  return { tiles: [...withoutOtherAnswer, tile], note: null };
}

function answerWord(label: string): string {
  const word = label.trim().toLowerCase();
  return word.slice(0, 1).toUpperCase() + word.slice(1);
}

function wantPhrase(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** The line in the sentence box. Tile labels alone are not a sentence. */
export function spokenSentence(labels: string[], timeNow = false): string {
  const words = labels.map((label) => label.trim()).filter(Boolean);
  if (words.length === 0) return "";
  const answer = [...words].reverse().find((word) => isAnswerLabel(word));
  const wants = words.filter((word) => !isAnswerLabel(word));
  if (answer && wants.length === 0) {
    const said = answerWord(answer);
    return timeNow ? `${said}, now.` : `${said}.`;
  }
  const phrase = wantPhrase(wants);
  const want = timeNow ? `I want ${phrase} now.` : `I want ${phrase}.`;
  if (answer) return `${answerWord(answer)}. ${want}`;
  return want;
}
