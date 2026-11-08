/**
 * T1.4: the Story Interviewer (ElevenLabs agent) on the interview screen.
 *
 * The agent asks one question at a time and calls the client tool
 * show_choices({ question, options: string[] }). We turn the labels back into
 * photo tiles and hand them to the page's window.showChoices bridge, which
 * shows PhotoChoiceGrid and resolves with the label the resident confirmed.
 *
 * The agent saves answers itself (save_answer webhook), so the page must not
 * save them again in guide mode. Nothing here approves or narrates a chapter.
 */
import { Conversation } from "@elevenlabs/client";
import { agentSession } from "./api";
import {
  STORY_CHAPTERS,
  questionsFor,
  type ChoiceOption,
  type ShowChoicesInput,
  type StoryChapterTemplate,
} from "./story-chapters";

export type GuideStatus = "starting" | "talking" | "listening" | "ended" | "error";

export interface StoryGuide {
  end: () => Promise<void>;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Turn the agent's option labels into photo tiles. Prefer the photos from the
 * matching question in this chapter, then any chapter that uses the label.
 * A label we cannot place still shows, as a text tile with no photo.
 */
export function choicesFromLabels(
  residentId: string,
  chapterKey: string,
  question: string,
  labels: string[],
): ShowChoicesInput {
  const inChapter = questionsFor(residentId, chapterKey);
  const match = inChapter.find((item) => same(item.question, question));
  const pool: ChoiceOption[] = [
    ...(match?.options ?? []),
    ...inChapter.flatMap((item) => item.options),
    ...STORY_CHAPTERS.flatMap((chapter) =>
      questionsFor(residentId, chapter.chapter_key).flatMap((item) => item.options),
    ),
  ];
  const options = labels
    .filter((label) => typeof label === "string" && label.trim())
    .slice(0, 4)
    .map((label) => pool.find((option) => same(option.label, label)) ?? { label, photo_id: "" });
  return { question, options };
}

/** The chapter's questions in the line format the agent prompt expects. */
export function chapterQuestionLines(residentId: string, chapterKey: string): string {
  return questionsFor(residentId, chapterKey)
    .map((item) => `${item.question} [${item.options.map((option) => option.label).join(" | ")}]`)
    .join("\n");
}

/**
 * Start a Story Interviewer session for one chapter. Resolves to null if the
 * guide is not available (not configured, offline); the tap-only interview
 * still works in that case.
 */
export async function startStoryGuide(input: {
  residentId: string;
  residentName: string;
  chapter: StoryChapterTemplate;
  onStatus: (status: GuideStatus) => void;
}): Promise<StoryGuide | null> {
  const { residentId, residentName, chapter, onStatus } = input;
  onStatus("starting");
  const signedUrl = await agentSession("story");
  if (!signedUrl) {
    onStatus("error");
    return null;
  }
  try {
    const conversation = await Conversation.startSession({
      signedUrl,
      textOnly: false,
      dynamicVariables: {
        resident_id: residentId,
        resident_name: residentName,
        chapter: chapter.chapter_key,
        chapter_title: chapter.title,
        chapter_questions: chapterQuestionLines(residentId, chapter.chapter_key),
      },
      clientTools: {
        show_choices: async (params: { question?: unknown; options?: unknown }) => {
          const question = typeof params.question === "string" ? params.question : "";
          const labels = Array.isArray(params.options) ? params.options.map(String) : [];
          if (!window.showChoices) return "The screen is not ready. Ask again.";
          return window.showChoices(choicesFromLabels(residentId, chapter.chapter_key, question, labels));
        },
      },
      onModeChange: ({ mode }) => onStatus(mode === "speaking" ? "talking" : "listening"),
      onDisconnect: () => onStatus("ended"),
      onError: () => onStatus("error"),
    });
    // Residents answer by tapping. A muted mic keeps room noise from cutting in.
    conversation.setMicMuted(true);
    return { end: () => conversation.endSession() };
  } catch {
    onStatus("error");
    return null;
  }
}
