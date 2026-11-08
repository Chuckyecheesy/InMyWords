import { LoadingNotice } from "@/components/LoadingNotice";
import { StaffHead } from "@/components/ui";

export default function Loading() {
  return (
    <>
      <StaffHead eyebrow="Staff" title="Getting things ready…" />
      <LoadingNotice message="Loading the staff page…" />
    </>
  );
}
