import { StaffShell } from "@/components/StaffShell";
import { getResident } from "@/lib/api";
import { DEMO_RESIDENT_IDS } from "@/lib/mock";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const people = (await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id))))
    .filter((person) => person !== null)
    .map(({ data }) => ({ id: data.id, name: data.name }));
  return <StaffShell people={people}>{children}</StaffShell>;
}
