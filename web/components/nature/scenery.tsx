import { Cloud, cx, Flower, Leaf, NatureSvg, type NatureProps } from "./base";
import { BeeShape, BirdShape, SnailShape } from "./creatures";
import { WildflowersShape } from "./plants";

/** Landing-page hero: rolling hills, sun (moon at night), clouds, a bird on a branch. */
export function HeroScene({ className, animate = true }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 800 300" fit="slice" className={cx("hero-scene", className)}>
      {/* Sun by day */}
      <g className="n-day">
        <circle className="n-sun" cx="560" cy="140" r="56" opacity="0.25" />
        <circle className="n-sun" cx="560" cy="140" r="36" />
      </g>
      {/* Moon and stars by night */}
      <g className="n-night">
        <circle className="n-moon" cx="560" cy="138" r="32" />
        <circle className="n-sky" cx="574" cy="128" r="27" />
        <circle className="n-moon" cx="430" cy="128" r="2.5" />
        <circle className="n-moon" cx="660" cy="122" r="2" />
        <circle className="n-moon" cx="700" cy="110" r="2.5" />
        <circle className="n-moon" cx="380" cy="150" r="1.8" />
      </g>

      <g className={cx(animate && "n-drift")}>
        <Cloud x={160} y={140} s={0.8} />
        <Cloud x={440} y={126} s={0.6} />
      </g>

      {/* Hills */}
      <path className="n-hill-1" d="M0 212 C120 150 260 160 380 192 C500 222 620 150 800 172 V300 H0Z" />
      <g>
        <path className="n-stem" d="M612 178 V164" />
        <circle className="n-leaf-3" cx="612" cy="156" r="12" />
        <path className="n-stem" d="M640 172 V156" />
        <circle className="n-leaf" cx="640" cy="146" r="15" />
        <path className="n-stem" d="M120 190 V178" />
        <circle className="n-leaf-3" cx="120" cy="170" r="10" />
      </g>
      <path className="n-hill-2" d="M0 240 C150 200 300 232 420 242 C560 254 680 210 800 222 V300 H0Z" />
      <path className="n-hill-3" d="M0 276 C180 252 380 282 520 272 C640 263 720 256 800 262 V300 H0Z" />

      {/* Branch from the right edge with a resting bird */}
      <path className="n-branch" d="M800 128 C750 130 710 140 664 160" />
      <Leaf x={760} y={130} r={-60} s={0.7} c="n-leaf" />
      <Leaf x={730} y={135} r={-115} s={0.6} c="n-leaf-2" />
      <Leaf x={694} y={148} r={-55} s={0.55} c="n-leaf-3" />
      <Leaf x={672} y={157} r={-120} s={0.5} c="n-leaf" />
      <g transform="translate(694 96) scale(0.55)">
        <BirdShape hop={animate} />
      </g>

      {/* Front flowers */}
      <g transform="translate(40 168) scale(0.7)">
        <WildflowersShape animate={false} />
      </g>
      <Flower x={300} y={262} s={0.8} c="n-petal-3" />
      <Flower x={330} y={270} s={0.6} c="n-petal-2" />
      <g transform="translate(470 238) scale(0.38)">
        <SnailShape />
      </g>
      <g transform="translate(250 196) scale(0.42)">
        <BeeShape />
      </g>
      <ellipse className="n-pebble" cx="560" cy="284" rx="14" ry="7" />
      <ellipse className="n-pebble-2" cx="582" cy="288" rx="9" ry="5" />
    </NatureSvg>
  );
}

/** A low row of pebbles and grass — a quiet footer for empty states. */
export function Pebbles({ className }: NatureProps) {
  return (
    <NatureSvg viewBox="0 0 160 40" className={className}>
      <ellipse className="n-pebble" cx="50" cy="30" rx="20" ry="9" />
      <ellipse className="n-pebble-2" cx="78" cy="33" rx="12" ry="6" />
      <ellipse className="n-pebble" cx="104" cy="32" rx="9" ry="5" />
      <Leaf x={30} y={36} r={-20} s={0.45} c="n-leaf" />
      <Leaf x={124} y={36} r={18} s={0.4} c="n-leaf-2" />
    </NatureSvg>
  );
}

/** A low strip of hills, grass and flowers that closes the bottom of a page. */
export function GardenEdge({ className }: NatureProps) {
  return (
    <svg
      className={cx("nature garden-edge", className)}
      viewBox="0 0 1200 110"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <path className="n-hill-1" d="M0 60 C180 30 360 40 560 62 C760 84 960 30 1200 48 V110 H0Z" />
      <path className="n-hill-2" d="M0 82 C220 62 420 84 640 86 C860 88 1020 66 1200 74 V110 H0Z" />
      <path className="n-hill-3" d="M0 100 C260 90 520 104 760 100 C960 96 1100 92 1200 96 V110 H0Z" />
      <g transform="translate(60 22) scale(0.5)">
        <WildflowersShape animate={false} />
      </g>
      <Flower x={300} y={86} s={0.7} c="n-petal-3" />
      <Flower x={322} y={92} s={0.55} c="n-petal-2" />
      <Leaf x={690} y={96} r={-24} s={0.5} c="n-leaf" />
      <Leaf x={700} y={96} r={20} s={0.45} c="n-leaf-2" />
      <g transform="translate(1040 18) scale(0.55)">
        <WildflowersShape animate={false} />
      </g>
      <ellipse className="n-pebble" cx="880" cy="98" rx="12" ry="6" />
      <ellipse className="n-pebble-2" cx="900" cy="101" rx="8" ry="4" />
    </svg>
  );
}
