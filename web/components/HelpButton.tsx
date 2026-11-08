"use client";

import { useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { getHelpRequests, requestHelp } from "@/lib/api";

/** "Get staff help" (ROADMAP Phase 6): a persistent, large control on every
 *  resident screen. Tap → confirm → an URGENT task notifies staff screens.
 *  The card says out loud that this is not emergency services.
 *  States: idle → confirm → requesting → acknowledged (or failed + retry). */

type Stage = "idle" | "confirm" | "requesting" | "acknowledged" | "failed";

const POLL_MS = 3000;

export function HelpButton({ residentId }: { residentId: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [seenBy, setSeenBy] = useState<string | null>(null);
  const requestId = useRef<number | null>(null);

  useEffect(() => {
    if (stage !== "requesting") return;
    const timer = setInterval(() => {
      void getHelpRequests(residentId).then((requests) => {
        const mine = requests.find((request) => request.id === requestId.current);
        if (mine && mine.status === "acknowledged") {
          setSeenBy(mine.acknowledged_by);
          setStage("acknowledged");
        }
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [stage, residentId]);

  async function ask() {
    setStage("requesting");
    const result = await requestHelp(residentId);
    if (!result.ok) {
      setStage("failed");
      return;
    }
    requestId.current = result.data.request.id;
  }

  if (stage === "idle") {
    return (
      <button
        type="button"
        className="help-fab"
        aria-label="Get staff help"
        onClick={() => setStage("confirm")}
      >
        <Hand size={26} aria-hidden="true" />
        <span>Get staff help</span>
      </button>
    );
  }

  return (
    <div className="help-layer" role="alertdialog" aria-label="Get staff help">
      <div className="card card-pad setup-card help-card">
        {stage === "confirm" ? (
          <>
            <h2>Ask the on-duty staff member to come?</h2>
            <p className="note">This asks staff in this home. It is not for emergencies.</p>
            <button type="button" className="btn" data-variant="primary" data-size="xl" onClick={() => void ask()}>
              Yes, please come
            </button>
            <button type="button" className="btn" data-variant="ghost" data-size="xl" onClick={() => setStage("idle")}>
              No, go back
            </button>
          </>
        ) : null}

        {stage === "requesting" ? (
          <>
            <h2>Asking staff now…</h2>
            <p className="note" role="status">Your request is on their screens. You can keep doing what you were doing.</p>
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => setStage("idle")}>
              Hide this
            </button>
          </>
        ) : null}

        {stage === "acknowledged" ? (
          <>
            <h2>{seenBy ? `${seenBy[0].toUpperCase()}${seenBy.slice(1)} saw this and is coming.` : "Staff saw this and is coming."}</h2>
            <button type="button" className="btn" data-variant="primary" data-size="xl" onClick={() => setStage("idle")}>
              OK
            </button>
          </>
        ) : null}

        {stage === "failed" ? (
          <>
            <h2>That didn&apos;t go through.</h2>
            <p className="note" role="alert">Staff were not notified. You can try again, or ask someone nearby.</p>
            <button type="button" className="btn" data-variant="primary" data-size="xl" onClick={() => void ask()}>
              Try again
            </button>
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => setStage("idle")}>
              Close
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
