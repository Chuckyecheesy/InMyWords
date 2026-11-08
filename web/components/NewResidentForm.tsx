"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRoundPlus } from "lucide-react";
import { createResident } from "@/lib/api";
import { Callout } from "./ui";

/** Create-a-resident (ROADMAP Phase 2). Everything entered here is
 *  staff-provided until the resident confirms it through the normal
 *  memory-confirm flow; the form says so out loud. */

const HOMES = [
  { id: "maple_house", label: "Maple House" },
  { id: "birch_house", label: "Birch House" },
];

const STAFF = [
  { id: "sam", label: "Sam" },
  { id: "jordan", label: "Jordan" },
];

export function NewResidentForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [pin, setPin] = useState("");
  const [homeId, setHomeId] = useState(HOMES[0].id);
  const [style, setStyle] = useState("");
  const [staffIds, setStaffIds] = useState<string[]>(["sam"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pinOk = /^\d{4,6}$/.test(pin);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createResident({
      first_name: firstName.trim(),
      pin,
      home_id: homeId,
      communication_style: style.trim(),
      staff_ids: staffIds,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/staff/${result.data.resident_id}`);
  }

  return (
    <form className="card card-pad stack new-resident" onSubmit={submit}>
      {error ? <Callout tone="error" role="alert">{error}</Callout> : null}
      <label className="field">
        First name
        <input value={firstName} maxLength={40} onChange={(event) => setFirstName(event.target.value)} />
      </label>
      <label className="field">
        Sign-in PIN (4 to 6 digits, for their photo-tile login)
        <input
          value={pin}
          inputMode="numeric"
          maxLength={6}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="field">
        Home
        <select value={homeId} onChange={(event) => setHomeId(event.target.value)}>
          {HOMES.map((home) => (
            <option key={home.id} value={home.id}>{home.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        How they communicate (staff notes, shown as staff-provided)
        <textarea rows={3} value={style} onChange={(event) => setStyle(event.target.value)} />
      </label>
      <fieldset className="field">
        <legend>Supporting staff</legend>
        {STAFF.map((person) => (
          <label key={person.id} className="check-row">
            <input
              type="checkbox"
              checked={staffIds.includes(person.id)}
              onChange={(event) =>
                setStaffIds((current) =>
                  event.target.checked
                    ? [...current, person.id]
                    : current.filter((id) => id !== person.id),
                )
              }
            />
            {person.label}
          </label>
        ))}
      </fieldset>
      <p className="note">
        They start with six basic cards (yes, no, help, water, music, outside) and can add
        their own. Everything you enter stays labelled as staff-provided until they confirm it.
      </p>
      <button
        type="submit"
        className="btn"
        data-variant="primary"
        data-size="lg"
        disabled={busy || !firstName.trim() || !pinOk}
      >
        <UserRoundPlus size={20} aria-hidden="true" /> Create their page
      </button>
    </form>
  );
}
