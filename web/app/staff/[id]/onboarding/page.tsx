import { notFound } from "next/navigation";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { getProfile, getResident, getStory } from "@/lib/api";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  const profile = await getProfile(id);
  if (!resident || !profile) notFound();
  const story = await getStory(id);

  return (
    <OnboardingFlow
      residentId={id}
      name={resident.data.name}
      profile={profile.data}
      chapters={story.data}
    />
  );
}
