import { cx, NatureSvg, type NatureProps } from "./base";

/** A round little robin, facing right. Drawn in a 100×80 box. */
export function BirdShape({ hop = false }: { hop?: boolean }) {
  return (
    <g className={cx(hop && "n-hop")}>
      <path className="n-bird-2" d="M22 44 L2 32 L6 52 Z" />
      <path className="n-ink-line" d="M36 63 L34 75 M46 63 L47 75" />
      <ellipse className="n-bird" cx="40" cy="46" rx="26" ry="20" />
      <ellipse className="n-breast" cx="56" cy="47" rx="11" ry="15" />
      <circle className="n-bird" cx="62" cy="29" r="14" />
      <path className="n-bird-2" d="M24 40 C32 29 50 33 52 46 C44 55 30 54 24 40Z" />
      <circle className="n-ink" cx="66" cy="26" r="2.4" />
      <path className="n-honey" d="M75 27 L85 30.5 L75 34 Z" />
    </g>
  );
}

export function Bird({ className, animate = true }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 100 80" className={className}>
      <BirdShape hop={animate} />
    </NatureSvg>
  );
}

/** A curled-up sleeping cat with a flicking tail. Drawn in a 170×110 box. */
export function SleepingCatShape({ animate = true }: { animate?: boolean }) {
  return (
    <g>
      <path className={cx("n-tail-stroke", animate && "n-tail")} d="M134 86 C152 88 162 80 160 66" />
      <g className={cx(animate && "n-breathe")}>
        <ellipse className="n-fur" cx="90" cy="74" rx="52" ry="28" />
        <path className="n-fur-line" d="M82 48 C86 56 86 62 82 68 M98 47 C102 55 102 62 98 68 M114 51 C118 57 118 63 114 69" />
        <path className="n-fur" d="M27 62 L24 40 L42 52Z" />
        <path className="n-fur" d="M50 52 L62 36 L66 58Z" />
        <path className="n-fur-3" d="M30 58 L28 46 L38 54Z" />
        <path className="n-fur-3" d="M53 52 L60 43 L62 56Z" />
        <circle className="n-fur" cx="46" cy="74" r="24" />
        <ellipse className="n-fur-3" cx="42" cy="83" rx="12" ry="8" />
        <path className="n-ink-line" d="M31 72 Q36 76 41 72 M49 70 Q54 74 59 70" />
        <path className="n-petal" d="M43 79 L47 79 L45 82Z" />
        <ellipse className="n-fur-3" cx="70" cy="98" rx="10" ry="5" />
      </g>
      <text className={cx("n-ink", animate && "n-zz")} x="74" y="30" fontSize="18" fontStyle="italic" fontFamily="Georgia, serif">
        z
      </text>
      <text className={cx("n-ink", animate && "n-zz")} x="86" y="18" fontSize="13" fontStyle="italic" fontFamily="Georgia, serif" style={{ animationDelay: "-1.6s" }}>
        z
      </text>
    </g>
  );
}

export function SleepingCat({ className, animate = true }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 170 110" className={className}>
      <SleepingCatShape animate={animate} />
    </NatureSvg>
  );
}

/** An unhurried snail. Drawn in a 120×80 box. */
export function SnailShape() {
  return (
    <g>
      <path className="n-snail" d="M6 72 Q6 64 16 64 H90 C98 64 102 56 102 46 C102 38 112 38 112 46 V66 Q112 72 104 72 Z" />
      <path className="n-ink-line" d="M104 42 L100 27 M109 42 L115 29" />
      <circle className="n-ink" cx="100" cy="26" r="2.8" />
      <circle className="n-ink" cx="115.5" cy="28" r="2.8" />
      <circle className="n-ink" cx="106" cy="52" r="1.8" />
      <circle className="n-shell" cx="54" cy="42" r="27" />
      <path className="n-shell-line" d="M56 42 a3.5 3.5 0 1 0 -6 2 a9 9 0 1 0 14 -6 a15 15 0 1 0 -22 20 a21 21 0 0 0 8 3" />
    </g>
  );
}

export function Snail({ className }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 120 80" className={className}>
      <SnailShape />
    </NatureSvg>
  );
}

/** A butterfly with gently flapping wings. Drawn in an 80×70 box. */
export function ButterflyShape({ animate = true }: { animate?: boolean }) {
  return (
    <g>
      <g className={cx(animate && "n-flap-l")}>
        <ellipse className="n-petal" cx="24" cy="26" rx="18" ry="16" />
        <ellipse className="n-petal-2" cx="27" cy="50" rx="12" ry="11" />
      </g>
      <g className={cx(animate && "n-flap-r")}>
        <ellipse className="n-petal" cx="56" cy="26" rx="18" ry="16" />
        <ellipse className="n-petal-2" cx="53" cy="50" rx="12" ry="11" />
      </g>
      <rect className="n-ink" x="38" y="18" width="4" height="40" rx="2" />
      <path className="n-ink-line" d="M40 20 C38 12 34 8 29 6 M40 20 C42 12 46 8 51 6" />
    </g>
  );
}

export function Butterfly({ className, animate = true }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 80 70" className={cx("butterfly", className)}>
      <ButterflyShape animate={animate} />
    </NatureSvg>
  );
}

/** A small round bee. Drawn in a 70×50 box. */
export function BeeShape() {
  return (
    <g>
      <ellipse className="n-wing" cx="30" cy="14" rx="10" ry="13" transform="rotate(-20 30 14)" />
      <ellipse className="n-wing" cx="42" cy="14" rx="9" ry="12" transform="rotate(18 42 14)" />
      <path className="n-ink" d="M12 31 L4 33 L12 36Z" />
      <ellipse className="n-honey" cx="34" cy="32" rx="21" ry="14" />
      <path className="n-stripe" d="M28 19 Q24 32 28 45 M39 19 Q35 32 39 45" />
      <circle className="n-ink" cx="55" cy="30" r="9" />
      <circle className="n-cloud" cx="58" cy="28" r="2" />
    </g>
  );
}

export function Bee({ className }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 70 50" className={className}>
      <BeeShape />
    </NatureSvg>
  );
}
