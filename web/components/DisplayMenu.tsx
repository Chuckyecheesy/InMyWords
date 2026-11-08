"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Contrast, SlidersHorizontal, Type } from "lucide-react";

type Setting = { attr: "theme" | "text"; on: string; off: string; storage: string; event: string };

const CONTRAST: Setting = {
  attr: "theme",
  on: "contrast",
  off: "calm",
  storage: "imw-theme",
  event: "imw-theme",
};
const LARGE: Setting = {
  attr: "text",
  on: "large",
  off: "default",
  storage: "imw-text",
  event: "imw-text",
};

function useSetting(setting: Setting): [boolean, () => void] {
  const value = useSyncExternalStore(
    (notify) => {
      window.addEventListener(setting.event, notify);
      return () => window.removeEventListener(setting.event, notify);
    },
    () => document.documentElement.dataset[setting.attr] === setting.on,
    () => false,
  );

  function toggle() {
    const root = document.documentElement;
    const next = root.dataset[setting.attr] === setting.on ? setting.off : setting.on;
    if (setting.attr === "text" && next === setting.off) delete root.dataset.text;
    else root.dataset[setting.attr] = next;
    try {
      localStorage.setItem(setting.storage, next);
    } catch {
      // private mode: the setting still applies for this visit
    }
    window.dispatchEvent(new Event(setting.event));
  }

  return [value, toggle];
}

/** Larger text and high contrast, in one predictable place on every screen. */
export function DisplayMenu({ size = "md" }: { size?: "md" | "lg" }) {
  const [open, setOpen] = useState(false);
  const [contrast, toggleContrast] = useSetting(CONTRAST);
  const [large, toggleLarge] = useSetting(LARGE);
  const ref = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    function onDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="display-menu" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="btn"
        data-variant="secondary"
        data-size={size === "lg" ? "lg" : undefined}
        aria-expanded={open}
        aria-label="Display settings"
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={20} aria-hidden="true" />
        <span className="btn-label">Display</span>
      </button>
      {open ? (
        <div className="display-panel" id={panelId} role="group" aria-label="Display settings">
          <button type="button" className="btn contrast-toggle" data-size="lg" aria-pressed={large} onClick={toggleLarge}>
            <Type size={22} aria-hidden="true" />
            Larger text
            <span className="toggle-dot" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn contrast-toggle"
            data-size="lg"
            aria-pressed={contrast}
            onClick={toggleContrast}
          >
            <Contrast size={22} aria-hidden="true" />
            High contrast
            <span className="toggle-dot" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
