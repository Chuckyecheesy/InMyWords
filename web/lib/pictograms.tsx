import { createElement, type ComponentType, type SVGProps } from "react";
import {
  Apple,
  Armchair,
  Bus,
  Check,
  Clapperboard,
  Clock,
  Coffee,
  Footprints,
  Frown,
  Hand,
  HandHelping,
  Headphones,
  Heart,
  House,
  Laugh,
  Leaf,
  MapPin,
  Moon,
  Music,
  Phone,
  ShoppingBasket,
  Smile,
  Sprout,
  Sun,
  TreeDeciduous,
  Tv,
  Users,
  Utensils,
  VolumeX,
  Wallet,
  X,
  Zap,
} from "lucide-react";

/**
 * AAC pictograms. One consistent line style (Lucide, 24px grid, 2px
 * round stroke) so every tile reads as part of one set. Two glyphs Lucide
 * lacks (bowling, basketball) are drawn here in the same style.
 *
 * Mapping is by tile label, so live tiles from the API pick up the same
 * pictogram. Unknown labels fall back to a Cloudinary photo (if any) and
 * then to the word itself — never a random icon.
 */

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
};

export type Icon = ComponentType<IconProps>;

function Glyph({
  size = 24,
  strokeWidth = 2,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function BowlingIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="9" cy="14" r="7" />
      <circle cx="7" cy="11.5" r="0.6" fill="currentColor" />
      <circle cx="10" cy="10.5" r="0.6" fill="currentColor" />
      <circle cx="9.5" cy="13.2" r="0.6" fill="currentColor" />
      <path d="M18.5 2c1.4 0 2 1.2 1.6 2.6-.3 1-.9 1.4-.9 2.4 0 1.3 1.8 2.6 1.8 6.5 0 3.2-1 5.5-2.5 5.5s-2.5-2.3-2.5-5.5c0-3.9 1.8-5.2 1.8-6.5 0-1-.6-1.4-.9-2.4C16.5 3.2 17.1 2 18.5 2Z" />
      <path d="M17.2 8.2h2.6" />
    </Glyph>
  );
}

export function BasketballIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2v20" />
      <path d="M5 4.9c2.6 1.8 4 4.4 4 7.1s-1.4 5.3-4 7.1" />
      <path d="M19 4.9c-2.6 1.8-4 4.4-4 7.1s1.4 5.3 4 7.1" />
    </Glyph>
  );
}

export function TeaIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M10 9V5.5" />
      <rect x="8.5" y="3" width="3" height="2.5" rx="0.6" />
      <path d="M3 21h14" />
    </Glyph>
  );
}

const BY_LABEL: Record<string, Icon> = {
  coffee: Coffee,
  "double-double": Coffee,
  tea: TeaIcon,
  food: Utensils,
  lunch: Utensils,
  snack: Apple,
  bowling: BowlingIcon,
  raptors: BasketballIcon,
  basketball: BasketballIcon,
  music: Music,
  headphones: Headphones,
  movie: Clapperboard,
  movies: Clapperboard,
  tv: Tv,
  park: TreeDeciduous,
  outside: Sun,
  walk: Footprints,
  bus: Bus,
  home: House,
  room: Armchair,
  balcony: Armchair,
  garden: Sprout,
  herbs: Leaf,
  shopping: ShoppingBasket,
  groceries: ShoppingBasket,
  money: Wallet,
  quiet: VolumeX,
  help: HandHelping,
  stop: Hand,
  happy: Smile,
  laugh: Laugh,
  sad: Frown,
  tired: Moon,
  excited: Zap,
  love: Heart,
  friends: Users,
  phone: Phone,
  later: Clock,
  now: Clock,
  place: MapPin,
  yes: Check,
  no: X,
};

export function pictogramFor(label: string): Icon | null {
  return BY_LABEL[label.trim().toLowerCase()] ?? null;
}

/** People tiles show a monogram, not a stranger's face or a generic icon. */
export function isPersonCategory(category: string): boolean {
  return category.toLowerCase() === "people";
}

const CATEGORY_TINT: Record<string, string> = {
  drinks: "var(--cat-drinks)",
  "food & drink": "var(--cat-food)",
  food: "var(--cat-food)",
  activities: "var(--cat-activities)",
  people: "var(--cat-people)",
  places: "var(--cat-places)",
  feelings: "var(--cat-feelings)",
  answers: "var(--cat-answers)",
  errands: "var(--cat-places)",
  words: "var(--cat-words)",
};

export function categoryTint(category: string): string {
  return CATEGORY_TINT[category.toLowerCase()] ?? "var(--cat-words)";
}

/** Renders the pictogram for a label (or a given icon). Null if none. */
export function Pictogram({ label, icon, ...props }: IconProps & { label: string; icon?: Icon }) {
  const component = icon ?? pictogramFor(label);
  return component ? createElement(component, props) : null;
}
