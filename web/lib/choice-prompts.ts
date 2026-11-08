/**
 * The two demo choices the resident screen posts to POST /choices.
 * The agent adds "not decided yet". Money is calculated on the server.
 */

export type ChoicePromptOption = {
  label: string;
  photo: string;
  cost: number;
};

export type ChoicePrompt = {
  question: string;
  options: ChoicePromptOption[];
};

export const NOT_DECIDED_LABEL = "not decided yet";
export const NOT_DECIDED_VALUE = "not_yet_decided";

export const CHOICE_PROMPTS: Record<string, ChoicePrompt> = {
  marcus: {
    question: "Bowling or a movie this Saturday?",
    options: [
      { label: "Bowling", photo: "tiles/marcus_bowling", cost: 15 },
      { label: "Movie", photo: "tiles/marcus_movie", cost: 12 },
    ],
  },
  dana: {
    question: "Herb garden or groceries this week?",
    options: [
      { label: "Herb garden", photo: "tiles/dana_herbs", cost: 22 },
      { label: "Groceries", photo: "tiles/dana_groceries", cost: 40 },
    ],
  },
};

export function choicePrompt(residentId: string): ChoicePrompt | null {
  return CHOICE_PROMPTS[residentId.toLowerCase()] ?? null;
}
