import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Instrument_Serif } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Atkinson Hyperlegible Next: designed for low-vision readers; clear
// letterforms suit AAC labels. Instrument Serif gives My Story its voice.
const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const viewport = {
  themeColor: "#f8f7f4",
};

export const metadata: Metadata = {
  title: {
    default: "In My Words",
    template: "%s · In My Words",
  },
  description: "Your story, told once, in your own voice. Your choices, made by you.",
};

export const dynamic = "force-dynamic";

const themeScript = `(function(){try{var t=localStorage.getItem("imw-theme");if(t==="contrast"||t==="calm"){document.documentElement.dataset.theme=t;}else if(window.matchMedia("(prefers-contrast: more)").matches){document.documentElement.dataset.theme="contrast";}var s=localStorage.getItem("imw-text");if(s==="large"){document.documentElement.dataset.text="large";}var f=localStorage.getItem("imw-touch");if(f==="onefinger"){document.documentElement.dataset.touch="onefinger";}}catch(e){}})();`;

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
        {children}
      </body>
    </html>
  );
}
