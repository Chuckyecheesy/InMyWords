import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DisplayMenu } from "./DisplayMenu";
import { GardenEdge } from "./nature";
import { WordmarkMark } from "./ui";

/** Plain shell for utility pages (not found, task board). */
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
    <div className="r-app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="r-topbar">
        <Link href="/" className="wordmark">
          <WordmarkMark />
          In My Words
        </Link>
        <div className="r-tools">
          <DisplayMenu />
        </div>
      </header>
      <main id="main" className="r-main">
        {backHref ? (
          <Link href={backHref} className="crumb">
            <ArrowLeft size={18} aria-hidden="true" />
            {backLabel ?? "Back"}
          </Link>
        ) : null}
        <div className="page-head">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {lede ? <p className="lead">{lede}</p> : null}
        </div>
        {children}
      </main>
      <GardenEdge />
    </div>
  );
}
