"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("imw-theme", onStoreChange);
  return () => window.removeEventListener("imw-theme", onStoreChange);
}

function themeIsContrast() {
  return document.documentElement.dataset.theme === "contrast";
}

export function ContrastToggle() {
  const contrast = useSyncExternalStore(subscribe, themeIsContrast, () => false);

  function toggle() {
    const next = document.documentElement.dataset.theme === "contrast" ? "calm" : "contrast";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("imw-theme", next);
    window.dispatchEvent(new Event("imw-theme"));
  }

  return (
    <button
      type="button"
      className="contrast-toggle"
      onClick={toggle}
      aria-pressed={contrast}
    >
      {contrast ? "Calm colours" : "High contrast"}
    </button>
  );
}
