"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getPlanner } from "@/lib/api";
import type { PlannerVisit } from "@/lib/planner";

const REFRESH_MS = 10_000;

export function usePlannerUpdates(
  residentId: string,
  enabled: boolean,
  setVisits: Dispatch<SetStateAction<PlannerVisit[]>>,
  setDeclined?: Dispatch<SetStateAction<PlannerVisit[]>>,
) {
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let inFlight = false;
    let refreshAgain = false;

    async function refresh() {
      if (document.visibilityState === "hidden") return;
      if (inFlight) {
        refreshAgain = true;
        return;
      }
      inFlight = true;
      const result = await getPlanner(residentId);
      inFlight = false;
      if (!active) return;
      if (!refreshAgain) {
        if (result.origin !== "api") {
          setUnavailable(true);
        } else {
          setVisits(result.data.visits);
          setDeclined?.(result.data.declined);
          setUnavailable(false);
        }
      }
      if (refreshAgain) {
        refreshAgain = false;
        void refresh();
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      if (!inFlight) void refresh();
    }, REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [residentId, enabled, setVisits, setDeclined]);

  return unavailable;
}
