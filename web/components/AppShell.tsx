import Link from "next/link";
import { ContrastToggle } from "./ContrastToggle";
import { TextSizeToggle } from "./TextSizeToggle";

export function AppShell({
  title,
  eyebrow,
  lede,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  eyebrow?: string;
  lede?: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link href="/" className="wordmark">
          In My Words
        </Link>
        <div className="topbar-actions">
          <TextSizeToggle />
          <ContrastToggle />
        </div>
      </header>
      <main id="main" className="main">
        {backHref ? (
          <Link href={backHref} className="back-link">
            {backLabel ?? "Back"}
          </Link>
        ) : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
        {children}
      </main>
    </>
  );
}
