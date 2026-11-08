/**
 * Illustrated chapter covers. They stand in until the resident adds their
 * own photos, and never show a person's face, so nobody is mistaken for
 * the resident.
 */

const INK = "#192b38";
const TEAL = "#247d78";
const TEAL_SOFT = "#7fb5a8";
const CORAL = "#e8957a";
const CORAL_SOFT = "#f6cdbd";
const SAND = "#efe1cf";
const SAND_DEEP = "#dcc3a6";
const SKY = "#dceaf2";
const SAGE = "#a9c6a0";
const SAGE_DEEP = "#7fa679";
const CREAM = "#fbf6ef";

function AboutMe() {
  return (
    <>
      <rect width="400" height="300" fill={SAND} />
      <rect y="214" width="400" height="86" fill={SAND_DEEP} />
      <rect x="236" y="38" width="122" height="132" rx="8" fill={SKY} stroke={CREAM} strokeWidth="8" />
      <path d="M297 38v132M236 104h122" stroke={CREAM} strokeWidth="6" />
      <circle cx="330" cy="70" r="14" fill={CORAL_SOFT} />
      <rect x="54" y="52" width="84" height="66" rx="6" fill={CREAM} />
      <circle cx="96" cy="85" r="20" fill={CORAL} />
      <path d="M76 85h40M96 65v40M83 70c6 5 6 25 0 30M109 70c-6 5-6 25 0 30" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <rect x="40" y="196" width="230" height="16" rx="4" fill={INK} />
      <rect x="58" y="212" width="10" height="70" fill={INK} />
      <rect x="242" y="212" width="10" height="70" fill={INK} />
      <path d="M96 150h44v34a14 14 0 0 1-14 14h-16a14 14 0 0 1-14-14v-34Z" fill={TEAL} />
      <path d="M140 158h8a10 10 0 0 1 0 20h-8" stroke={TEAL} strokeWidth="6" fill="none" />
      <path d="M108 140c-4-8 4-12 0-20M124 140c-4-8 4-12 0-20" stroke={INK} strokeOpacity=".35" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M200 128c9 0 12 8 10 16-2 7-6 10-6 16 0 9 10 16 10 28 0 6-5 8-14 8s-14-2-14-8c0-12 10-19 10-28 0-6-4-9-6-16-2-8 1-16 10-16Z" fill={CREAM} stroke={INK} strokeWidth="2.5" />
      <path d="M192 150h16" stroke={CORAL} strokeWidth="4" />
    </>
  );
}

function People() {
  return (
    <>
      <rect width="400" height="300" fill={SKY} />
      <circle cx="200" cy="330" r="190" fill="#c7dcea" />
      <rect x="150" y="40" width="100" height="70" rx="14" fill={CREAM} />
      <path d="M200 92c-16-10-26-18-26-28a12 12 0 0 1 22-6l4 4 4-4a12 12 0 0 1 22 6c0 10-10 18-26 28Z" fill={CORAL} />
      <circle cx="140" cy="168" r="30" fill={TEAL} />
      <path d="M86 300c0-56 24-92 54-92s54 36 54 92Z" fill={TEAL} />
      <circle cx="262" cy="176" r="27" fill={CORAL} />
      <path d="M212 300c0-50 22-84 50-84s50 34 50 84Z" fill={CORAL} />
      <rect x="182" y="200" width="36" height="62" rx="8" fill={INK} />
      <rect x="187" y="208" width="26" height="40" rx="3" fill={SKY} />
    </>
  );
}

function ThingsILove() {
  return (
    <>
      <rect width="400" height="300" fill={CORAL_SOFT} />
      <path d="M150 300 186 120h28l36 180Z" fill={SAND} />
      <path d="M186 120h28" stroke={SAND_DEEP} strokeWidth="4" />
      <path d="M160 300 190 140M240 300 210 140" stroke={SAND_DEEP} strokeWidth="2" />
      {[188, 200, 212, 194, 206].map((x, i) => (
        <g key={i} transform={`translate(${x} ${i < 3 ? 100 : 108})`}>
          <path d="M0 0c4 0 5 4 4 7-1 3-3 4-3 7 0 4 4 7 4 12 0 3-2 4-5 4s-5-1-5-4c0-5 4-8 4-12 0-3-2-4-3-7-1-3 0-7 4-7Z" fill={CREAM} stroke={INK} strokeWidth="1.4" />
        </g>
      ))}
      <circle cx="200" cy="246" r="30" fill={INK} />
      <circle cx="191" cy="236" r="3.5" fill={CREAM} />
      <circle cx="203" cy="232" r="3.5" fill={CREAM} />
      <circle cx="201" cy="244" r="3.5" fill={CREAM} />
      <circle cx="322" cy="78" r="40" fill={CORAL} />
      <path d="M282 78h80M322 38v80M296 50c12 8 18 18 18 28s-6 20-18 28M348 50c-12 8-18 18-18 28s6 20 18 28" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M40 70c30-30 70-36 100-18" stroke={TEAL} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="2 12" />
    </>
  );
}

function Places() {
  return (
    <>
      <defs>
        <linearGradient id="sky-places" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY} />
          <stop offset="1" stopColor={CREAM} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#sky-places)" />
      <circle cx="306" cy="74" r="30" fill={CORAL} />
      <path d="M0 200c70-40 140-44 210-20s130 20 190-6v126H0Z" fill={SAGE} />
      <path d="M0 236c90-28 180-24 260 0s110 12 140 4v60H0Z" fill={SAGE_DEEP} />
      <path d="M170 300c10-40 40-70 90-96" stroke={SAND} strokeWidth="26" fill="none" strokeLinecap="round" />
      {[
        [70, 176, 34],
        [118, 190, 26],
        [330, 182, 30],
      ].map(([x, y, r], i) => (
        <g key={i}>
          <rect x={x - 4} y={y} width="8" height={r + 16} fill={INK} />
          <circle cx={x} cy={y - r * 0.4} r={r} fill={TEAL} />
        </g>
      ))}
      <rect x="226" y="214" width="56" height="8" rx="3" fill={INK} />
      <rect x="230" y="222" width="5" height="14" fill={INK} />
      <rect x="273" y="222" width="5" height="14" fill={INK} />
      <rect x="226" y="200" width="56" height="6" rx="3" fill={INK} />
    </>
  );
}

function MyDay() {
  return (
    <>
      <rect width="400" height="300" fill={CREAM} />
      <defs>
        <linearGradient id="sunrise" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9d9c7" />
          <stop offset="1" stopColor="#fbeee0" />
        </linearGradient>
      </defs>
      <rect x="44" y="34" width="176" height="136" rx="10" fill="url(#sunrise)" stroke={SAND_DEEP} strokeWidth="6" />
      <circle cx="132" cy="150" r="34" fill={CORAL} />
      <rect x="44" y="150" width="176" height="20" fill={SAGE} />
      <path d="M132 34v136M44 102h176" stroke={SAND_DEEP} strokeWidth="5" />
      <circle cx="310" cy="82" r="40" fill="#fff" stroke={INK} strokeWidth="5" />
      <path d="M310 58v24l16 10" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
      <rect y="206" width="400" height="94" fill={SAND_DEEP} />
      <rect y="196" width="400" height="14" fill={INK} />
      <path d="M232 196v-40a28 28 0 0 1 28-28h20a28 28 0 0 1 28 28v40Z" fill={TEAL} />
      <path d="M308 150h14l10 14" stroke={TEAL} strokeWidth="7" fill="none" strokeLinecap="round" />
      <rect x="258" y="116" width="24" height="12" rx="4" fill={INK} />
      <path d="M120 162h40v26a8 8 0 0 1-8 8h-24a8 8 0 0 1-8-8v-26Z" fill={CORAL_SOFT} stroke={INK} strokeWidth="3" />
      <path d="M160 168h6a8 8 0 0 1 0 16h-6" stroke={INK} strokeWidth="3" fill="none" />
      <path d="M132 150c-3-6 3-9 0-15M148 150c-3-6 3-9 0-15" stroke={INK} strokeOpacity=".35" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  );
}

function Default() {
  return (
    <>
      <rect width="400" height="300" fill={SAND} />
      <circle cx="290" cy="90" r="40" fill={CORAL_SOFT} />
      <path d="M0 210c80-50 160-50 240-10s120 30 160 0v100H0Z" fill={TEAL_SOFT} />
      <path d="M0 250c100-30 200-26 290 0s80 10 110 0v50H0Z" fill={TEAL} />
    </>
  );
}

const SCENES: Record<string, () => React.JSX.Element> = {
  about_me: AboutMe,
  people: People,
  people_who_matter: People,
  family: People,
  things_i_love: ThingsILove,
  favourite_places: Places,
  places: Places,
  my_day: MyDay,
  daily_life: MyDay,
};

export function ChapterArt({ chapterKey, className }: { chapterKey: string; className?: string }) {
  const Scene = SCENES[chapterKey] ?? Default;
  return (
    <div className={`art ${className ?? ""}`}>
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration">
        <Scene />
      </svg>
    </div>
  );
}

/** Option art for My Choices (bowling, movie, garden, groceries). */
export function OptionArt({ label }: { label: string }) {
  const key = label.toLowerCase();
  if (key.includes("bowl")) {
    return (
      <div className="art">
        <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of a bowling lane">
          <rect width="400" height="225" fill={CORAL_SOFT} />
          <path d="M120 225 178 70h44l58 155Z" fill={SAND} />
          <path d="M178 70h44" stroke={SAND_DEEP} strokeWidth="4" />
          {[184, 198, 212, 191, 205].map((x, i) => (
            <path
              key={i}
              transform={`translate(${x} ${i < 3 ? 46 : 54})`}
              d="M0 0c4 0 5 4 4 7-1 3-3 4-3 7 0 4 4 7 4 12 0 3-2 4-5 4s-5-1-5-4c0-5 4-8 4-12 0-3-2-4-3-7-1-3 0-7 4-7Z"
              fill={CREAM}
              stroke={INK}
              strokeWidth="1.4"
            />
          ))}
          <circle cx="200" cy="180" r="30" fill={INK} />
          <circle cx="191" cy="170" r="3.5" fill={CREAM} />
          <circle cx="203" cy="166" r="3.5" fill={CREAM} />
          <circle cx="201" cy="178" r="3.5" fill={CREAM} />
        </svg>
      </div>
    );
  }
  if (key.includes("movie") || key.includes("film")) {
    return (
      <div className="art">
        <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of a cinema screen">
          <rect width="400" height="225" fill={INK} />
          <rect x="70" y="30" width="260" height="110" rx="6" fill={SKY} />
          <path d="M70 140 120 100l40 24 60-50 110 66Z" fill={TEAL_SOFT} />
          <circle cx="280" cy="64" r="14" fill={CORAL_SOFT} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={52 + i * 50} y="168" width="42" height="40" rx="12" fill={CORAL} opacity={0.9} />
          ))}
        </svg>
      </div>
    );
  }
  if (key.includes("garden") || key.includes("herb")) return <ChapterArt chapterKey="favourite_places" />;
  return <ChapterArt chapterKey="default" />;
}
