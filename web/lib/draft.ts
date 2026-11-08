/** Shared composer draft (ROADMAP Phase 6): switching input modes —
 *  letter board, eye typing, speak tiles — must never lose the resident's
 *  words. One draft per resident, kept on this device only. */

const key = (residentId: string) => `imw-draft-${residentId}`;

export function loadDraft(residentId: string): string {
  try {
    return localStorage.getItem(key(residentId)) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(residentId: string, text: string): void {
  try {
    if (text) localStorage.setItem(key(residentId), text);
    else localStorage.removeItem(key(residentId));
  } catch {
    // private mode: the draft lives for this visit only
  }
}
