import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Fraunces } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Atkinson Hyperlegible Next: designed for low-vision readers; clear
// letterforms suit AAC labels. Fraunces (soft, warm serif) gives headings
// and My Story their voice.
const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const serif = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "opsz"],
  variable: "--font-serif",
  display: "swap",
});

export const viewport = {
  themeColor: "#f7f2ea",
};

export const metadata: Metadata = {
  title: {
    default: "In My Words",
    template: "%s · In My Words",
  },
  description: "Your story, told once, in your own voice. Your choices, made by you.",
};

export const dynamic = "force-dynamic";

const themeScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("imw-theme");if(t==="contrast"||t==="calm"||t==="dark"){d.dataset.theme=t;}else if(window.matchMedia("(prefers-contrast: more)").matches){d.dataset.theme="contrast";}else if(window.matchMedia("(prefers-color-scheme: dark)").matches){d.dataset.theme="dark";}var s=localStorage.getItem("imw-text");if(s==="large"){d.dataset.text="large";}var f=localStorage.getItem("imw-touch");if(f==="onefinger"){d.dataset.touch="onefinger";}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="imw-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>
        <div className="atmosphere" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
