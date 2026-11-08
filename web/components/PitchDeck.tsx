"use client";

import { useState } from "react";
import { PITCH_SLIDES } from "@/lib/pitch";
import { BigButton } from "./shared";

export function PitchDeck() {
  const [index, setIndex] = useState(0);
  const slide = PITCH_SLIDES[index];

  return (
    <section className="block entry-stage pitch-stage" data-testid="pitch-deck" aria-label="Pitch deck">
      <p className="kicker">
        Slide {index + 1} of {PITCH_SLIDES.length}
      </p>
      <p className="kicker kicker-accent">{slide.kicker}</p>
      <h2>{slide.title}</h2>
      {slide.lines.map((line) => (
        <p key={line} className="pitch-line">
          {line}
        </p>
      ))}
      <div className="speak-actions">
        <BigButton disabled={index === 0} onClick={() => setIndex((current) => current - 1)}>
          Back
        </BigButton>
        <BigButton
          disabled={index === PITCH_SLIDES.length - 1}
          onClick={() => setIndex((current) => current + 1)}
        >
          Next
        </BigButton>
      </div>
    </section>
  );
}
