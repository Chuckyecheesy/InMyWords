import { SleepingCat } from "./nature";

export function LoadingNotice({ message = "Getting things ready…" }: { message?: string }) {
  return (
    <div className="fact loading-notice" role="status" aria-live="polite" aria-atomic="true">
      <SleepingCat />
      <p>{message}</p>
      <p>You can take your time.</p>
    </div>
  );
}
