/**
 * T3.4 chapter templates. Seven chapters, each with 3–5 questions that can
 * be answered by tapping a picture. The Story agent's show_choices tool
 * renders these through PhotoChoiceGrid and returns the tapped label.
 */

export interface StoryOptionTemplate {
  label: string;
  /** Key into PHOTO_IDS. Resolved per resident so the picture matches the person. */
  photo: string;
}

export interface StoryQuestionTemplate {
  question: string;
  options: StoryOptionTemplate[];
}

export interface StoryChapterTemplate {
  chapter_key: string;
  title: string;
  questions: StoryQuestionTemplate[];
}

export interface ChoiceOption {
  label: string;
  photo_id: string;
}

export interface StoryQuestion {
  question: string;
  options: ChoiceOption[];
}

const MARCUS: Record<string, string> = {
  coffee: "tiles/marcus_coffee",
  tea: "tiles/marcus_tea",
  bowling: "tiles/marcus_bowling",
  raptors: "tiles/marcus_raptors",
  park: "tiles/marcus_park",
  music: "tiles/marcus_music",
  bus: "tiles/marcus_bus",
  quiet: "tiles/marcus_quiet",
  lisa: "tiles/marcus_lisa",
  help: "tiles/marcus_help",
  yes: "tiles/marcus_yes",
  no: "tiles/marcus_no",
};

const DANA: Record<string, string> = {
  garden: "tiles/dana_garden",
  sister: "tiles/dana_sister",
  groceries: "tiles/dana_groceries",
  tea: "tiles/dana_tea",
  walk: "tiles/dana_walk",
  money: "tiles/dana_money",
  tv: "tiles/dana_tv",
  herbs: "tiles/dana_herbs",
  bus: "tiles/dana_bus",
  help: "tiles/dana_help",
  yes: "tiles/dana_yes",
  no: "tiles/dana_no",
};

const PHOTO_IDS: Record<string, Record<string, string>> = {
  marcus: MARCUS,
  dana: DANA,
};

export function photoId(residentId: string, key: string): string {
  return PHOTO_IDS[residentId]?.[key] || MARCUS[key] || DANA[key] || "";
}

function options(...rows: [string, string][]): StoryOptionTemplate[] {
  return rows.map(([label, photo]) => ({ label, photo }));
}

export const STORY_CHAPTERS: StoryChapterTemplate[] = [
  {
    chapter_key: "about_me",
    title: "About me",
    questions: [
      {
        question: "What is a favourite memory?",
        options: options(
          ["Bowling", "bowling"],
          ["Family time", "lisa"],
          ["The park", "park"],
        ),
      },
      {
        question: "Who matters most?",
        options: options(
          ["Lisa", "lisa"],
          ["My sister", "sister"],
          ["Staff who help", "help"],
        ),
      },
      {
        question: "How do you like to start the day?",
        options: options(
          ["Coffee", "coffee"],
          ["Tea", "tea"],
          ["Quiet", "quiet"],
        ),
      },
      {
        question: "What is a goal this year?",
        options: options(
          ["More bowling", "bowling"],
          ["See the Raptors", "raptors"],
          ["Grow herbs", "herbs"],
          ["Learn a song", "music"],
        ),
      },
    ],
  },
  {
    chapter_key: "people_who_matter",
    title: "People who matter",
    questions: [
      {
        question: "Who do you want to see?",
        options: options(
          ["Lisa", "lisa"],
          ["My sister", "sister"],
          ["Staff who help", "help"],
        ),
      },
      {
        question: "What do you like to do together?",
        options: options(
          ["Tea", "tea"],
          ["A walk", "walk"],
          ["Watch the game", "raptors"],
        ),
      },
      {
        question: "What should they know about you?",
        options: options(
          ["Quiet helps", "quiet"],
          ["I like bowling", "bowling"],
          ["Ask me first", "yes"],
        ),
      },
    ],
  },
  {
    chapter_key: "my_day",
    title: "My day",
    questions: [
      {
        question: "What is your morning drink?",
        options: options(
          ["Coffee", "coffee"],
          ["Tea", "tea"],
        ),
      },
      {
        question: "What is a weekday plan?",
        options: options(
          ["Groceries", "groceries"],
          ["My budget", "money"],
          ["The bus", "bus"],
        ),
      },
      {
        question: "What do you like after dinner?",
        options: options(
          ["A walk", "walk"],
          ["TV", "tv"],
          ["Quiet", "quiet"],
        ),
      },
      {
        question: "Where do you need a hand?",
        options: options(
          ["Money", "money"],
          ["The bus", "bus"],
          ["I can do it", "yes"],
        ),
      },
      {
        question: "How do you get home?",
        options: options(
          ["The bus", "bus"],
          ["A walk", "walk"],
          ["With Lisa", "lisa"],
        ),
      },
    ],
  },
  {
    chapter_key: "things_i_love",
    title: "Things I love",
    questions: [
      {
        question: "What do you love to do?",
        options: options(
          ["Bowling", "bowling"],
          ["The garden", "garden"],
          ["Music", "music"],
        ),
      },
      {
        question: "What sound do you like?",
        options: options(
          ["Music", "music"],
          ["Quiet", "quiet"],
          ["TV", "tv"],
        ),
      },
      {
        question: "What do you like to drink?",
        options: options(
          ["Coffee", "coffee"],
          ["Tea", "tea"],
        ),
      },
      {
        question: "What do you like to grow or make?",
        options: options(
          ["The garden", "garden"],
          ["Herbs", "herbs"],
          ["Music", "music"],
        ),
      },
    ],
  },
  {
    chapter_key: "places",
    title: "Places",
    questions: [
      {
        question: "Where do you like to go?",
        options: options(
          ["The park", "park"],
          ["Bowling", "bowling"],
          ["Groceries", "groceries"],
        ),
      },
      {
        question: "How do you get there?",
        options: options(
          ["The bus", "bus"],
          ["A walk", "walk"],
          ["With Lisa", "lisa"],
        ),
      },
      {
        question: "Where is hard for you?",
        options: options(
          ["Loud rooms", "quiet"],
          ["A busy store", "groceries"],
          ["Nowhere", "no"],
        ),
      },
    ],
  },
  {
    chapter_key: "feelings",
    title: "Feelings",
    questions: [
      {
        question: "What helps when it is loud?",
        options: options(
          ["Quiet", "quiet"],
          ["Music", "music"],
          ["Ask for help", "help"],
        ),
      },
      {
        question: "What does a good day look like?",
        options: options(
          ["Bowling", "bowling"],
          ["Tea together", "tea"],
          ["A walk", "walk"],
        ),
      },
      {
        question: "When you want space, what do you pick?",
        options: options(
          ["Quiet", "quiet"],
          ["The park", "park"],
          ["Not yet", "no"],
        ),
      },
      {
        question: "How do you say yes?",
        options: options(
          ["Yes", "yes"],
          ["Help me say it", "help"],
        ),
      },
    ],
  },
  {
    chapter_key: "goals",
    title: "Goals",
    questions: [
      {
        question: "What do you want this year?",
        options: options(
          ["More bowling", "bowling"],
          ["An herb garden", "herbs"],
          ["See the Raptors", "raptors"],
        ),
      },
      {
        question: "Who can help?",
        options: options(
          ["Lisa", "lisa"],
          ["My sister", "sister"],
          ["Staff", "help"],
        ),
      },
      {
        question: "How often?",
        options: options(
          ["Saturdays", "bowling"],
          ["Sundays", "tea"],
          ["Mondays", "money"],
        ),
      },
      {
        question: "What is a first step?",
        options: options(
          ["Take the bus", "bus"],
          ["Buy herbs", "herbs"],
          ["Call Lisa", "lisa"],
        ),
      },
      {
        question: "Are you ready to try?",
        options: options(
          ["Yes", "yes"],
          ["Not yet", "no"],
          ["I need help", "help"],
        ),
      },
    ],
  },
];

export function questionsFor(residentId: string, chapterKey: string): StoryQuestion[] {
  const chapter = STORY_CHAPTERS.find((item) => item.chapter_key === chapterKey);
  if (!chapter) return [];
  return chapter.questions.map((question) => ({
    question: question.question,
    options: question.options.map((option) => ({
      label: option.label,
      photo_id: photoId(residentId, option.photo),
    })),
  }));
}

export function chapterTemplateErrors(chapters: StoryChapterTemplate[] = STORY_CHAPTERS): string[] {
  const errors: string[] = [];
  if (chapters.length !== 7) {
    errors.push(`expected 7 chapters, found ${chapters.length}`);
  }
  const keys = new Set<string>();
  for (const chapter of chapters) {
    if (keys.has(chapter.chapter_key)) errors.push(`duplicate chapter ${chapter.chapter_key}`);
    keys.add(chapter.chapter_key);
    const count = chapter.questions.length;
    if (count < 3 || count > 5) {
      errors.push(`${chapter.chapter_key} has ${count} questions; need 3 to 5`);
    }
    for (const question of chapter.questions) {
      const labels = question.options.map((option) => option.label);
      if (labels.length < 2 || labels.length > 4) {
        errors.push(`"${question.question}" has ${labels.length} pictures; need 2 to 4`);
      }
      if (new Set(labels).size !== labels.length) {
        errors.push(`"${question.question}" repeats a label`);
      }
      for (const option of question.options) {
        if (!photoId("marcus", option.photo) && !photoId("dana", option.photo)) {
          errors.push(`"${option.label}" has no photo`);
        }
      }
    }
  }
  return errors;
}

export type ShowChoicesInput = {
  question: string;
  options: ChoiceOption[];
};

declare global {
  interface Window {
    /** Story agent client tool. Resolves with the label the resident confirms. */
    showChoices?: (input: ShowChoicesInput) => Promise<string>;
  }
}
