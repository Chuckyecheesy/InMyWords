import { getResident } from "@/lib/api";
import { sampleEssentials, sampleRoutines } from "@/lib/mock";
import { notFound } from "next/navigation";
import OnboardingFlow from "@/components/OnboardingFlow";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  const essentials = sampleEssentials(id);
  const routines = sampleRoutines(id);

  return (
    <OnboardingFlow
      resident={resident.data}
      essentials={essentials}
      routines={routines}
    />
  );
}
