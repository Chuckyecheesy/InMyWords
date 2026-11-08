import { NewResidentForm } from "@/components/NewResidentForm";

export const metadata = { title: "Add a person" };

export default function NewResidentPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">Residents</p>
        <h1>Add a person</h1>
        <p className="lead">
          Set up a new resident: their page, starter cards, and a photo-tile sign-in.
        </p>
      </header>
      <NewResidentForm />
    </div>
  );
}
