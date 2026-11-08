"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, LogIn, UserRound } from "lucide-react";
import { getResidentLogins, login } from "@/lib/api";
import { Avatar, Callout, WordmarkMark } from "./ui";

/** Accounts (ROADMAP Phase 2): shared-tablet sign-in.
 *  Residents tap their name, then a large-key PIN pad (no time limits).
 *  Staff use email + password. Nothing here blocks the demo: open mode
 *  still allows browsing, signing in just scopes what a session can see. */

type ResidentLogin = { resident_id: string; display_name: string };

export function LoginScreen() {
  const router = useRouter();
  const [people, setPeople] = useState<ResidentLogin[]>([]);
  const [picked, setPicked] = useState<ResidentLogin | null>(null);
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getResidentLogins().then(setPeople);
  }, []);

  async function signIn(loginId: string, secret: string, destination: string) {
    setBusy(true);
    setError(null);
    const result = await login(loginId, secret);
    setBusy(false);
    if (!result.ok) {
      setError("That didn't match. Try again.");
      setPin("");
      return;
    }
    router.push(destination);
  }

  return (
    <div className="stack login-page">
      <header className="page-head" style={{ textAlign: "center" }}>
        <span className="wordmark" style={{ justifyContent: "center" }}>
          <WordmarkMark />
          <span className="btn-label">In My Words</span>
        </span>
        <h1>Who is this?</h1>
        <p className="lead">Tap your name, or sign in as staff below.</p>
      </header>

      {error ? <Callout tone="error" role="alert">{error}</Callout> : null}

      {!picked ? (
        <section className="card card-pad" aria-label="I live here">
          <p className="eyebrow">I live here</p>
          <div className="login-people">
            {people.map((person) => (
              <button
                key={person.resident_id}
                type="button"
                className="login-person"
                onClick={() => {
                  setPicked(person);
                  setPin("");
                  setError(null);
                }}
              >
                <Avatar name={person.display_name} />
                <span>{person.display_name}</span>
              </button>
            ))}
            {people.length === 0 ? <p className="note">No one can sign in yet. Ask staff to set you up.</p> : null}
          </div>
        </section>
      ) : (
        <section className="card card-pad" aria-label={`PIN for ${picked.display_name}`}>
          <p className="eyebrow">Hi {picked.display_name}</p>
          <p className="lead">Enter your PIN. Take your time.</p>
          <p className="pin-dots" aria-label={`${pin.length} digits entered`} role="status">
            {pin.length === 0 ? "· · · ·" : "●".repeat(pin.length)}
          </p>
          <div className="pin-pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
              <button
                key={digit}
                type="button"
                className="pin-key"
                disabled={busy}
                onClick={() => setPin((value) => (value.length < 6 ? value + digit : value))}
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              className="pin-key"
              aria-label="Remove last digit"
              disabled={busy || pin.length === 0}
              onClick={() => setPin((value) => value.slice(0, -1))}
            >
              <Delete size={28} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="pin-key pin-go"
              disabled={busy || pin.length < 4}
              onClick={() => void signIn(picked.resident_id, pin, `/resident/${picked.resident_id}`)}
            >
              Go
            </button>
          </div>
          <div className="setup-actions">
            <button
              type="button"
              className="btn"
              data-variant="ghost"
              data-size="lg"
              onClick={() => {
                setPicked(null);
                setPin("");
                setError(null);
              }}
            >
              Not me, go back
            </button>
          </div>
        </section>
      )}

      <section className="card card-pad" aria-label="I work here">
        <p className="eyebrow">
          <UserRound size={16} aria-hidden="true" /> I work here
        </p>
        <form
          className="login-staff"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn(email.trim(), password, "/staff");
          }}
        >
          <label className="field">
            Email
            <input
              type="email"
              value={email}
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit" className="btn" data-variant="primary" data-size="lg" disabled={busy || !email || !password}>
            <LogIn size={20} aria-hidden="true" /> Sign in
          </button>
        </form>
      </section>
    </div>
  );
}
