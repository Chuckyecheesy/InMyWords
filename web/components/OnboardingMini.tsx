"use client";

import Link from "next/link";
import { useStoredString } from "@/lib/client-store";
import { ONBOARDING_EVENT, ONBOARDING_STEPS, onboardingKey, parseOnboarding } from "@/lib/onboarding";
import { Progress } from "./ui";

export function OnboardingMini({ residentId, name }: { residentId: string; name: string }) {
  const count = parseOnboarding(useStoredString(onboardingKey(residentId), ONBOARDING_EVENT)).length;
  const complete = count >= ONBOARDING_STEPS;
  return (
    <div className="mini-progress">
      <div className="mini-progress-label">
        <span>Onboarding for {name}</span>
        <span>{complete ? "Complete" : `${count} of ${ONBOARDING_STEPS} steps`}</span>
      </div>
      <Progress value={count / ONBOARDING_STEPS} label={`Onboarding for ${name}`} />
      <div className="row" style={{ marginTop: 6 }}>
        <Link href={`/staff/${residentId}/onboarding`} className="btn" data-variant={complete ? "secondary" : "primary"} data-size="sm">
          {complete ? "Review onboarding" : count > 0 ? "Continue onboarding" : "Start onboarding"}
        </Link>
        <Link href={`/staff/${residentId}/coach`} className="btn" data-variant="secondary" data-size="sm">
          Ask the Coach
        </Link>
      </div>
    </div>
  );
}
