/** Six pitch slides. Nothing on this deck advances by itself. */

export type PitchSlide = {
  kicker: string;
  title: string;
  lines: string[];
};

export const PITCH_SLIDES: PitchSlide[] = [
  {
    kicker: "1. Hook",
    title: "Your story, told once, in your own voice.",
    lines: [
      "Imagine learning about someone from a binder written years ago, by someone else.",
      "In My Words lets a resident say it, choose it, and keep it.",
    ],
  },
  {
    kicker: "2. What KW Habilitation told us",
    title: "The binder is out of date. The person is not.",
    lines: [
      "Residents in supported living often communicate with pictures, not long sentences.",
      "Staff learn them from old notes. Choices get made around them.",
      "They asked for the person's own words, and for new staff to learn those words quickly.",
    ],
  },
  {
    kicker: "3. Live demo",
    title: "Told once. Heard by everyone.",
    lines: [
      "Marcus's story plays in the voice he picked.",
      "Coffee and now become a sentence he approves, then hears.",
      "He picks bowling. One card books the lane, the calendar, and a note to Lisa.",
      "A noticed pattern stays a question until he taps yes.",
    ],
  },
  {
    kicker: "4. How it works",
    title: "Four doors. The resident holds the key.",
    lines: [
      "Profile, memory, actions, and the EMH record each have their own server.",
      "Gemini writes the words. Code does the money.",
      "ElevenLabs speaks only after the resident approves.",
      "Swap a mock service for a real one without rewriting the screens.",
    ],
  },
  {
    kicker: "5. Guardrails",
    title: "Nothing is said, saved, or booked without a yes.",
    lines: [
      "Every fact wears its source: his words, a staff note, the record, or a pattern.",
      "A pattern is never his words until he confirms it.",
      "Actions come from an allowlist, show the cost, and can be cancelled.",
      "There is no “staff decided.”",
    ],
  },
  {
    kicker: "6. What's next",
    title: "The demo uses fiction. The shape is ready.",
    lines: [
      "Point a real EMH record and an org calendar at the same four doors.",
      "Keep the data in Canada.",
      "Put the app on the project domain.",
      "The resident still approves every word and every plan.",
    ],
  },
];
