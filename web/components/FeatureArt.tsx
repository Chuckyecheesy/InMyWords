import { CalendarDays, Check, Clapperboard, Clock, Coffee, Heart, Sun } from "lucide-react";
import { BasketballIcon, BowlingIcon } from "@/lib/pictograms";

/** Calm, adult compositions of the same pictogram set, no clip art. */
export function FeatureArt({ kind }: { kind: "speak" | "story" | "choice" | "planner" }) {
  if (kind === "planner") {
    return (
      <div className="feature-art" aria-hidden="true">
        <div className="art-piece" style={{ left: "10%", top: "18%", width: 150, height: 160, transform: "rotate(-5deg)", alignContent: "center", gap: 8 }}>
          <CalendarDays size={56} strokeWidth={1.6} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Every day</span>
        </div>
        <div className="art-piece" style={{ left: "52%", top: "26%", width: 150, height: 150, transform: "rotate(5deg)", alignContent: "center", gap: 8, background: "var(--sage-soft)" }}>
          <Clock size={52} strokeWidth={1.6} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>1:00p.m.</span>
        </div>
        <div
          className="art-piece"
          style={{ left: "40%", top: "12%", width: 48, height: 48, borderRadius: 999, background: "var(--accent)", color: "#fff", zIndex: 2 }}
        >
          <Check size={26} strokeWidth={3} />
        </div>
      </div>
    );
  }
  if (kind === "speak") {
    return (
      <div className="feature-art" aria-hidden="true">
        <div className="art-piece" style={{ left: "10%", top: "44%", width: 92, height: 92, transform: "rotate(-6deg)", background: "var(--cat-drinks)" }}>
          <Coffee size={44} strokeWidth={1.75} />
        </div>
        <div className="art-piece" style={{ left: "37%", top: "52%", width: 92, height: 92, transform: "rotate(3deg)" }}>
          <Sun size={44} strokeWidth={1.75} />
        </div>
        <div className="art-piece" style={{ left: "64%", top: "42%", width: 92, height: 92, transform: "rotate(8deg)", background: "var(--cat-answers)" }}>
          <Check size={44} strokeWidth={1.75} />
        </div>
        <div className="art-bubble" style={{ left: "12%", top: "12%" }}>
          I&apos;d like a coffee, please.
        </div>
      </div>
    );
  }
  if (kind === "story") {
    return (
      <div className="feature-art" aria-hidden="true">
        <div className="art-photo" style={{ left: "8%", top: "22%", width: 140, height: 150, transform: "rotate(-8deg)" }}>
          <div style={{ background: "linear-gradient(160deg, #e9b48f, #c9785a)" }}>
            <BowlingIcon size={52} strokeWidth={1.6} />
          </div>
        </div>
        <div className="art-photo" style={{ left: "60%", top: "18%", width: 140, height: 150, transform: "rotate(7deg)" }}>
          <div style={{ background: "linear-gradient(160deg, #8fb7c9, #4d7f97)" }}>
            <BasketballIcon size={52} strokeWidth={1.6} />
          </div>
        </div>
        <div className="art-photo" style={{ left: "33%", top: "30%", width: 150, height: 162, zIndex: 2, transform: "rotate(-1deg)" }}>
          <div style={{ background: "linear-gradient(160deg, #7fb5a8, #247d78)" }}>
            <Heart size={56} strokeWidth={1.6} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="feature-art" aria-hidden="true">
      <div className="art-piece" style={{ left: "12%", top: "20%", width: 130, height: 160, transform: "rotate(-5deg)", alignContent: "center", gap: 10 }}>
        <BowlingIcon size={56} strokeWidth={1.6} />
        <span style={{ fontWeight: 700, fontSize: 18 }}>$15</span>
      </div>
      <div className="art-piece" style={{ left: "52%", top: "24%", width: 130, height: 160, transform: "rotate(5deg)", alignContent: "center", gap: 10 }}>
        <Clapperboard size={56} strokeWidth={1.6} />
        <span style={{ fontWeight: 700, fontSize: 18 }}>$12</span>
      </div>
      <div
        className="art-piece"
        style={{ left: "38%", top: "14%", width: 48, height: 48, borderRadius: 999, background: "var(--accent)", color: "#fff", zIndex: 2 }}
      >
        <Check size={26} strokeWidth={3} />
      </div>
    </div>
  );
}
