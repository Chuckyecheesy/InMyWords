import { FlaskConical } from "lucide-react";

/** Says plainly when a screen is showing sample data, not the live API. */
export function DataBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className="banner" role="status">
      <FlaskConical size={18} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
