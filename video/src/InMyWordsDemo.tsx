import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { CaptionOverlay, MusicBed } from "./components/audio";
import { Beat, ChoiceAndPlanner, Coach, Memory, StaffHelp, Story } from "./scenes/product";
import { Architecture, Closing } from "./scenes/close";
import { ColdOpen, LogoIntro, Presenter } from "./scenes/intro";
import { SimulatedSpeak } from "./scenes/simulated-speak";

/** Timeline at 30 fps. Total 7500 frames = 4:10. */
export const SCENES: Array<{ id: string; frames: number; node: React.ReactNode }> = [
  { id: "cold-open", frames: 450, node: <ColdOpen /> },
  { id: "presenter", frames: 900, node: <Presenter /> },
  { id: "logo", frames: 450, node: <LogoIntro /> },
  { id: "login", frames: 360, node: <Beat screen="login" headline="Photo + PIN. No time limits." vo="login" /> },
  { id: "categories", frames: 150, node: <Beat screen="categories" headline="Three big choices, on a tired day." vo="categories" /> },
  { id: "sim-speak", frames: 630, node: <SimulatedSpeak /> },
  { id: "picture-card", frames: 180, node: <Beat screen="picture-card" headline="His own picture cards." vo="picture-card" /> },
  { id: "letter-board", frames: 180, node: <Beat screen="letter-board" headline="A letter board that knows his words." vo="letter-board" /> },
  { id: "builder", frames: 240, node: <Beat screen="builder" headline="Guided, but always skippable." vo="builder" /> },
  { id: "eye-typing", frames: 300, node: <Beat screen="eye-typing" headline="Spell by looking." vo="eye-typing" /> },
  { id: "one-finger", frames: 210, node: <Beat screen="one-finger" headline="One-finger mode. Drafts carry over." vo="one-finger" /> },
  { id: "choice-planner", frames: 900, node: <ChoiceAndPlanner /> },
  { id: "staff-help", frames: 390, node: <StaffHelp /> },
  { id: "story", frames: 420, node: <Story /> },
  { id: "updates", frames: 210, node: <Beat screen="updates" headline="One feed answers: what changed?" vo="updates" /> },
  { id: "coach", frames: 300, node: <Coach /> },
  { id: "records", frames: 180, node: <Beat screen="records" headline="Records that never disappear." /> },
  { id: "memory", frames: 300, node: <Memory /> },
  { id: "architecture", frames: 300, node: <Architecture /> },
  { id: "closing", frames: 450, node: <Closing /> },
];

export const TOTAL_FRAMES = SCENES.reduce((sum, scene) => sum + scene.frames, 0);

export const InMyWordsDemo: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Series>
      {SCENES.map((scene) => (
        <Series.Sequence key={scene.id} durationInFrames={scene.frames}>
          {scene.node}
        </Series.Sequence>
      ))}
    </Series>
    <MusicBed />
    <CaptionOverlay />
  </AbsoluteFill>
);
