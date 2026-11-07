"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("imw-text", onStoreChange);
  return () => window.removeEventListener("imw-text", onStoreChange);
}

function textIsLarge() {
  return document.documentElement.dataset.text === "large";
}

export function TextSizeToggle() {
  const large = useSyncExternalStore(subscribe, textIsLarge, () => false);

  function toggle() {
    const next = document.documentElement.dataset.text === "large" ? "default" : "large";
    if (next === "default") {
      delete document.documentElement.dataset.text;
    } else {
      document.documentElement.dataset.text = next;
    }
    localStorage.setItem("imw-text", next);
    window.dispatchEvent(new Event("imw-text"));
  }

  return (
    <button
      type="button"
      className="text-size-toggle"
      onClick={toggle}
      aria-pressed={large}
    >
      {large ? "Default text" : "Larger text"}
    </button>
  );
}
