import { cx, Flower, Leaf, NatureSvg, type NatureProps } from "./base";

/** Eucalyptus sprig — round leaves on a gently curving stem. */
export function SprigShape({ animate = true }: { animate?: boolean }) {
  const leaves: [number, number, number, number, string][] = [
    [40, 134, -28, 1, "n-leaf"],
    [62, 118, 28, 1, "n-leaf-2"],
    [38, 96, -32, 0.9, "n-leaf-3"],
    [62, 80, 30, 0.9, "n-leaf"],
    [40, 60, -30, 0.78, "n-leaf-2"],
    [60, 44, 30, 0.7, "n-leaf-3"],
  ];
  return (
    <g className={cx(animate && "n-sway")}>
      <path className="n-stem" d="M50 158 C48 120 56 80 49 10" />
      {leaves.map(([x, y, r, s, c]) => (
        <ellipse
          key={`${x}-${y}`}
          className={c}
          cx={x}
          cy={y}
          rx={15 * s}
          ry={11 * s}
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
      <ellipse className="n-leaf" cx="49" cy="16" rx="8" ry="6.5" />
    </g>
  );
}

export function Sprig({ className, animate = true }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 100 160" className={className}>
      <SprigShape animate={animate} />
    </NatureSvg>
  );
}

/** Monstera leaf with its signature slits. */
export function Monstera({ className, animate = true }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 140 170" className={className}>
      <g className={cx(animate && "n-sway")}>
        <path className="n-stem" d="M70 168 C73 146 70 124 70 104" />
        <path
          className="n-leaf"
          d="M70 106 C30 102 6 72 10 44 C14 18 40 2 63 13 C67 15 70 19 70 24 C70 19 73 15 77 13 C100 2 126 18 130 44 C134 72 110 102 70 106Z"
        />
        <path className="n-vein" d="M70 26 C70 52 70 80 70 104" />
        <path className="n-cut" d="M12 48 L40 54 M18 76 L46 68 M38 16 L52 38 M128 48 L100 54 M122 76 L94 68 M102 16 L88 38" />
      </g>
    </NatureSvg>
  );
}

/** A little potted plant. */
export function PottedPlant({ className, animate = true }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 120 160" className={className}>
      <g className={cx(animate && "n-sway")}>
        <path className="n-stem" d="M60 112 C58 92 52 74 40 56" />
        <path className="n-stem" d="M60 112 C62 88 70 70 84 50" />
        <path className="n-stem" d="M60 112 C60 92 60 64 60 34" />
        <Leaf x={52} y={88} r={-70} s={0.7} c="n-leaf-2" />
        <Leaf x={68} y={84} r={70} s={0.7} c="n-leaf" />
        <Leaf x={40} y={58} r={-38} s={0.9} c="n-leaf" />
        <Leaf x={84} y={52} r={38} s={0.9} c="n-leaf-2" />
        <Leaf x={60} y={36} r={0} s={0.85} c="n-leaf-3" />
      </g>
      <path className="n-pot" d="M32 112 H88 L82 153 Q81 158 76 158 H44 Q39 158 38 153Z" />
      <rect className="n-pot-2" x="27" y="104" width="66" height="15" rx="7" />
    </NatureSvg>
  );
}

/** A cluster of wildflowers. */
export function WildflowersShape({ animate = true }: { animate?: boolean }) {
  return (
    <g className={cx(animate && "n-sway")}>
      <path className="n-stem" d="M30 158 C32 120 26 92 30 62" />
      <path className="n-stem" d="M70 158 C68 112 74 82 70 38" />
      <path className="n-stem" d="M108 158 C106 122 112 102 108 76" />
      <path className="n-stem" d="M50 158 C52 142 48 130 50 118" />
      <path className="n-stem" d="M90 158 C88 140 94 128 92 114" />
      <Leaf x={30} y={124} r={-50} s={0.6} />
      <Leaf x={70} y={112} r={50} s={0.7} c="n-leaf-2" />
      <Leaf x={108} y={132} r={-42} s={0.55} c="n-leaf-3" />
      <Flower x={30} y={62} c="n-petal" />
      <Flower x={70} y={38} s={1.2} c="n-petal-2" />
      <Flower x={108} y={76} c="n-petal-3" />
      <Flower x={50} y={118} s={0.7} c="n-petal-2" />
      <Flower x={92} y={114} s={0.7} c="n-petal" />
    </g>
  );
}

export function Wildflowers({ className, animate = true }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 140 160" className={className}>
      <WildflowersShape animate={animate} />
    </NatureSvg>
  );
}

/** A soft fern frond. */
export function Fern({ className, animate = true }: NatureProps) {
  const fronds = Array.from({ length: 9 }, (_, i) => {
    const y = 156 - i * 15;
    const x = 60 + Math.sin(i / 2.4) * 3;
    const s = 0.78 - i * 0.06;
    const c = i % 2 === 0 ? "n-leaf" : "n-leaf-2";
    return (
      <g key={i}>
        <Leaf x={x} y={y} r={-64} s={s} c={c} />
        <Leaf x={x} y={y} r={64} s={s} c={i % 2 === 0 ? "n-leaf-2" : "n-leaf-3"} />
      </g>
    );
  });
  return (
    <NatureSvg viewBox="0 0 120 170" className={className}>
      <g className={cx(animate && "n-sway")}>
        <path className="n-stem" d="M60 168 C60 130 65 80 58 14" />
        {fronds}
        <Leaf x={58} y={22} s={0.3} c="n-leaf-3" />
      </g>
    </NatureSvg>
  );
}
