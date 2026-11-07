import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const body = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
  display: "swap",
});

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "In My Words",
    template: "%s · In My Words",
  },
  description: "Your story, told once, in your own voice. Your choices, made by you.",
};

export const dynamic = "force-dynamic";

const themeScript = `(function(){try{var t=localStorage.getItem("imw-theme");if(t==="contrast"||t==="calm"){document.documentElement.dataset.theme=t;}else if(window.matchMedia("(prefers-contrast: more)").matches){document.documentElement.dataset.theme="contrast";}var s=localStorage.getItem("imw-text");if(s==="large"){document.documentElement.dataset.text="large";}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script
          id="imw-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {children}
      </body>
    </html>
  );
}
