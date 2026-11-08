"use client";

import { useState, useRef, type ReactNode } from "react";
import { BigButton } from "./shared";
import { tileImageUrl } from "@/lib/cloudinary";

export interface ChoiceOption {
  label: string;
  photo_id: string;
}

const LONG_PRESS_MS = 600;

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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  function handlePointerDown(label: string) {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onLongPress?.(label);
    }, LONG_PRESS_MS);
  }

  function handlePointerUp() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  function handleClick(label: string) {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    setSelectedLabel(label);
    onChoice(label);
  }

  return (
    <div className="photo-choice-grid">
      <div className="choice-question">
        <h3>{question}</h3>
      </div>

      <div className="choice-options">
        {options.map((option) => {
          const photoUrl = option.photo_id ? tileImageUrl(option.photo_id, "calm") : null;
          const contrastUrl = option.photo_id ? tileImageUrl(option.photo_id, "contrast") : null;
          const isSelected = selectedLabel === option.label;

          return (
            <div
              key={option.label}
              className={`choice-option ${isSelected ? "is-selected" : ""}`}
              onPointerDown={() => handlePointerDown(option.label)}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <button
                type="button"
                className="choice-button"
                aria-label={option.label}
                onClick={() => handleClick(option.label)}
              >
                <picture>
                  {photoUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="choice-img choice-img-calm"
                        src={photoUrl}
                        alt=""
                      />
                    </>
                  )}
                  {contrastUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="choice-img choice-img-contrast"
                        src={contrastUrl}
                        alt=""
                      />
                    </>
                  )}
                </picture>
                <span className="choice-label">{option.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      {selectedLabel && (
        <div className="choice-confirmation">
          <p>
            <strong>{selectedLabel}</strong> selected.
          </p>
          <BigButton onClick={() => setSelectedLabel(null)} tone="neutral">
            Choose Again
          </BigButton>
        </div>
      )}
    </div>
  );
}
