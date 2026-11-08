"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useClientValue } from "@/lib/client-store";
import { House, Volume2 } from "lucide-react";
import { speak } from "@/lib/api";
import { deviceSpeechAvailable, speakWithDevice } from "@/lib/speech";
import { DisplayMenu } from "./DisplayMenu";
import { HelpButton } from "./HelpButton";
import { GardenEdge } from "./nature";
import { QUIET_SECTIONS, SectionArt } from "./SectionArt";
import { Avatar, WordmarkMark } from "./ui";

const LONG_PRESS_MS = 600;

function instructionsFor(section: string, name: string): string {
  switch (section) {
    case "services":
      return "Choose Refreshments, Entertainment, or Family. You can choose more than one. Review your choices, then confirm to send a request to staff. With hand control, hold the pointer over each button for one second.";
    case "speak":
      return "Choose Refreshments, Entertainment, or Family. Your complete sentence appears below. Choose Say my words when you are ready. With your eyes, look at a large button and hold for one second.";
    case "story":
      return "This is your story. Tap a chapter to read it. Tap Play my story to hear it in your voice.";
    case "interview":
      return "Tap the picture that fits best. Take your time. Tap Next when you're ready.";
    case "choice":
      return "Look at each choice. Tap Hear this to listen. Tap Choose when you're ready. You can also tap I'm not ready to decide.";
    case "confirm":
      return "Is this still true? Tap Yes, No, or Not sure.";
    case "voice":
      return "Tap Play to hear each voice. Tap Choose to pick the one that sounds like you.";
    case "calibrate":
      return "Look at each dot until it turns into a check. Take your time.";
    case "teach":
      return "Pick a tile, then show your hand sign to the camera a few times.";
    default:
      return `Hi ${name}. Tap Speak For Me to talk with pictures. Tap My Story to tell people about your life. Tap My Choices to decide something.`;
  }
}

function sectionOf(pathname: string, id: string): string {
  const rest = pathname.replace(`/resident/${id}`, "").replace(/^\//, "");
  if (rest.startsWith("story/interview")) return "interview";
  return rest.split("/")[0] ?? "";
}

/**
 * Long-press any button or link to hear its label in the device voice
 * (CLAUDE.md accessibility rule). Elements that handle long-press
 * themselves opt out with data-longpress="own".
 */
/** Labels are read in the resident's own voice; the device voice is the fallback. */
async function sayLabel(residentId: string, label: string) {
  if (!label) return;
  const spoken = await speak({ resident_id: residentId, text: label });
  if (spoken.ok) {
    try {
      await new Audio(spoken.data.audio_url).play();
      return;
    } catch {
      // fall through to the device voice
    }
  }
  speakWithDevice(label);
}

function useLongPressLabels(root: React.RefObject<HTMLElement | null>, residentId: string) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let suppress: Element | null = null;

    function clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      start = null;
    }

    function onDown(event: PointerEvent) {
      const target = (event.target as Element | null)?.closest("button, a");
      if (!target || target.closest('[data-longpress="own"]')) return;
      clear();
      start = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => {
        const label = target.getAttribute("aria-label") || target.textContent?.trim() || "";
        suppress = target;
        void sayLabel(residentId, label);
      }, LONG_PRESS_MS);
    }

    function onMove(event: PointerEvent) {
      if (!start) return;
      if (Math.abs(event.clientX - start.x) > 12 || Math.abs(event.clientY - start.y) > 12) clear();
    }

    function onClick(event: MouseEvent) {
      if (suppress && (event.target as Element | null)?.closest("button, a") === suppress) {
        event.preventDefault();
        event.stopPropagation();
      }
      suppress = null;
    }

    node.addEventListener("pointerdown", onDown);
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", clear);
    node.addEventListener("pointercancel", clear);
    node.addEventListener("click", onClick, true);
    return () => {
      clear();
      node.removeEventListener("pointerdown", onDown);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", clear);
      node.removeEventListener("pointercancel", clear);
      node.removeEventListener("click", onClick, true);
    };
  }, [root, residentId]);
}

function HearInstructions({ text }: { text: string }) {
  const available = useClientValue(deviceSpeechAvailable, false);
  if (!available) return null;
  return (
    <button
      type="button"
      className="btn"
      data-variant="secondary"
      data-size="lg"
      data-longpress="own"
      aria-label="Hear instructions"
      onClick={() => speakWithDevice(text)}
    >
      <Volume2 size={22} aria-hidden="true" />
      <span className="btn-label">Hear instructions</span>
    </button>
  );
}

export function ResidentChrome({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? `/resident/${id}`;
  const section = sectionOf(pathname, id);
  const atHome = section === "";
  const ref = useRef<HTMLDivElement | null>(null);
  useLongPressLabels(ref, id);
  const back =
    section === "interview"
      ? { href: `/resident/${id}/story`, label: "My Story" }
      : section === "calibrate" || section === "teach"
        ? { href: `/resident/${id}/speak`, label: "Speak For Me" }
        : { href: `/resident/${id}`, label: "Home" };

  return (
    <div className="r-app resident" ref={ref}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="r-topbar">
        {atHome ? (
          <span className="wordmark">
            <WordmarkMark />
            <span className="btn-label">In My Words</span>
          </span>
        ) : (
          <Link prefetch={false} href={back.href} className="btn" data-variant="secondary" data-size="lg">
            <House size={22} aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <div className="r-identity">
          <Avatar name={name} />
          <span>{name}</span>
        </div>
        <div className="r-tools">
          <HearInstructions text={instructionsFor(section, name)} />
          <DisplayMenu size="lg" />
        </div>
      </header>
      <main id="main" className="r-main">
        <SectionArt section={section} />
        {children}
      </main>
      {QUIET_SECTIONS.has(section) ? null : <GardenEdge />}
      <HelpButton residentId={id} />
    </div>
  );
}
