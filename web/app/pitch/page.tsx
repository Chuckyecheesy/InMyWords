import { AppShell } from "@/components/AppShell";
import { PitchDeck } from "@/components/PitchDeck";

export const metadata = { title: "Pitch" };

export default function PitchPage() {
  return (
    <AppShell
      eyebrow="Pitch"
      title="In My Words"
      lede="Six slides. They wait until someone taps Next."
      backHref="/"
      backLabel="Home"
    >
      <PitchDeck />
    </AppShell>
  );
}
