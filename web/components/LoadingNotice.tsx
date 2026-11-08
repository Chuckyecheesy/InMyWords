export function LoadingNotice({ message = "Getting things ready…" }: { message?: string }) {
  return (
    <div className="fact" role="status" aria-live="polite" aria-atomic="true">
      <p>{message}</p>
      <p>You can take your time.</p>
    </div>
  );
}
