"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { demoPhotoUrl } from "@/lib/cloudinary";

export interface ChoiceOption {
  label: string;
  photo_id: string;
}

const LONG_PRESS_MS = 600;

/**
 * Picture answers for the Story agent's show_choices tool.
 * A tap selects. A 600ms press speaks the label and does not select.
 * The caller confirms before the answer is saved.
 */
export function PhotoChoiceGrid({
  question,
  options,
  onChoice,
  onLongPress,
}: {
  question: ReactNode;
  options: ChoiceOption[];
  onChoice: (label: string) => void;
  onLongPress?: (label: string) => void;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const questionKey = typeof question === "string" ? question : "";
  const optionKey = options.map((option) => option.label).join("|");

  useEffect(() => {
    setSelectedLabel(null);
  }, [questionKey, optionKey]);

  return (
    <div className="photo-choice-grid" data-testid="photo-choice-grid">
      <div className="choice-question">
        <h2>{question}</h2>
      </div>

      <div className="choice-options" role="group" aria-label="Picture answers">
        {options.slice(0, 4).map((option) => (
          <ChoiceTile
            key={option.label}
            option={option}
            selected={selectedLabel === option.label}
            onChoice={(label) => {
              setSelectedLabel(label);
              onChoice(label);
            }}
            onLongPress={onLongPress}
          />
        ))}
      </div>

      {selectedLabel ? (
        <div className="choice-confirmation">
          <p>
            <strong>{selectedLabel}</strong> selected.
          </p>
          <button
            type="button"
            className="big-button"
            onClick={() => {
              setSelectedLabel(null);
              onChoice("");
            }}
          >
            Choose again
          </button>
        </div>
      ) : (
        <p className="note">Hold a picture to hear its name.</p>
      )}
    </div>
  );
}

function ChoiceTile({
  option,
  selected,
  onChoice,
  onLongPress,
}: {
  option: ChoiceOption;
  selected: boolean;
  onChoice: (label: string) => void;
  onLongPress?: (label: string) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const calm = option.photo_id ? demoPhotoUrl(option.photo_id) : null;
  const contrast = calm;

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    fired.current = false;
    clear();
    if (!onLongPress) return;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress(option.label);
    }, LONG_PRESS_MS);
  }

  return (
    <button
      type="button"
      className={`choice-button${selected ? " is-selected" : ""}`}
      aria-label={option.label}
      aria-pressed={selected}
      data-choice={option.label}
      onPointerDown={onPointerDown}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onChoice(option.label);
      }}
    >
      {calm && contrast ? (
        <picture>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="choice-img choice-img-calm" src={calm} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="choice-img choice-img-contrast" src={contrast} alt="" />
        </picture>
      ) : (
        <span className="choice-letter" aria-hidden="true">
          {option.label}
        </span>
      )}
      <span className="choice-label">{option.label}</span>
    </button>
  );
}
