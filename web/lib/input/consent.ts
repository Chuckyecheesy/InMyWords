/**
 * Camera consent, per resident, saved on the device (GAZE_GESTURE_PLAN §5).
 * Off by default. One tap off at any time. Nothing camera-related may run
 * unless this says yes.
 */

const KEY = (residentId: string) => `imw-camera-consent-${residentId}`;

export function hasCameraConsent(residentId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY(residentId)) === "yes";
}

export function setCameraConsent(residentId: string, consent: boolean): void {
  if (typeof window === "undefined") return;
  if (consent) window.localStorage.setItem(KEY(residentId), "yes");
  else window.localStorage.removeItem(KEY(residentId));
}
