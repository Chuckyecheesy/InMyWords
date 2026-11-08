/** Per-device onboarding progress. A convenience only; never shared state. */
export const ONBOARDING_STEPS = 5;
export const ONBOARDING_EVENT = "imw-onboard";

export function onboardingKey(residentId: string) {
  return `imw-onboard-${residentId}`;
}

export function parseOnboarding(raw: string | null): number[] {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number") : [];
  } catch {
    return [];
  }
}

export function writeOnboarding(residentId: string, done: number[]) {
  try {
    localStorage.setItem(onboardingKey(residentId), JSON.stringify(done));
  } catch {
    // private mode: progress lasts until reload
  }
  window.dispatchEvent(new Event(ONBOARDING_EVENT));
}
