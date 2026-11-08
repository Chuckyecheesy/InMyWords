/**
 * Shared bits for the hand-drawn nature illustrations.
 * Every shape is coloured by a CSS class (see "Nature" in globals.css),
 * so it follows the light / dark theme and hides in high contrast.
 * All illustrations are decorative: aria-hidden, never focusable.
 */

export type NatureProps = {
  className?: string;
  /** Turn the illustration's gentle ambient motion on (default true). */
  animate?: boolean;
};

export function NatureSvg({
  viewBox,
  className,
  fit = "meet",
  children,
}: {
  viewBox: string;
  className?: string;
  /** "slice" fills the box and crops; "meet" fits inside it. */
  fit?: "meet" | "slice";
  children: React.ReactNode;
}) {
  return (
    <svg
      className={`nature${className ? ` ${className}` : ""}`}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio={`xMidYMax ${fit}`}
    >
      {children}
    </svg>
  );
}

/** A pointed leaf growing upward from (0,0) to (0,-44). */
const LEAF = "M0 0 C9 -12 10 -30 0 -44 C-10 -30 -9 -12 0 0Z";

export function Leaf({
  x,
  y,
  r = 0,
  s = 1,
  c = "n-leaf",
}: {
  x: number;
  y: number;
  r?: number;
  s?: number;
  c?: string;
}) {
  return <path className={c} d={LEAF} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} />;
}

/** A five-petal wildflower centred on (x,y). */
export function Flower({
  x,
  y,
  s = 1,
  c = "n-petal",
}: {
  x: number;
  y: number;
  s?: number;
  c?: string;
}) {
  const petals = [0, 72, 144, 216, 288].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return (
      <circle
        key={deg}
        className={c}
        cx={x + Math.sin(rad) * 7 * s}
        cy={y - Math.cos(rad) * 7 * s}
        r={6.2 * s}
      />
    );
  });
  return (
    <g>
      {petals}
      <circle className="n-honey" cx={x} cy={y} r={4.4 * s} />
    </g>
  );
}

export function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle className="n-cloud" cx="0" cy="0" r="22" />
      <circle className="n-cloud" cx="26" cy="-10" r="28" />
      <circle className="n-cloud" cx="56" cy="2" r="20" />
      <rect className="n-cloud" x="-6" y="0" width="70" height="20" rx="10" />
    </g>
  );
}

export const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");
