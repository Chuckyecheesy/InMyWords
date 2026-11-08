"""Google Calendar client for the actions server (Planner path).

A calendar client is any object with
    insert(calendar_id, event) -> google_event_id
    list(calendar_id, time_min, time_max) -> [event]
Tests inject a fake through actions_server.set_calendar_client(). This is
the real one: Calendar API v3 over REST with a service account.

Env (.env):
    GOOGLE_SERVICE_ACCOUNT_JSON   path to the key file, or the JSON itself
    GOOGLE_CALENDAR_STAFF_EMAILS  "sam=sam@x.org,priya=priya@x.org", or one
                                  calendar id that every staff visit goes to
                                  (demo). The calendar must be shared with
                                  the service account ("make changes to events").
"""

from __future__ import annotations

import json
import os
from pathlib import Path

API = "https://www.googleapis.com/calendar/v3"
SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
ROOT = Path(__file__).resolve().parents[1]


def _load_env() -> None:
    """Read .env (setdefault, so real env vars win) without relying on the
    caller having opened the store first."""
    from store import _load_env as load
    load()


def calendar_id_for(staff_id: str) -> str | None:
    """The Google calendar a staff member's visits land on."""
    _load_env()
    raw = os.environ.get("GOOGLE_CALENDAR_STAFF_EMAILS", "").strip()
    if not raw:
        return None
    pairs = [p.strip() for p in raw.split(",") if p.strip()]
    mapping = dict(p.split("=", 1) for p in pairs if "=" in p)
    if staff_id in mapping:
        return mapping[staff_id].strip()
    plain = [p for p in pairs if "=" not in p]
    return plain[0] if plain else None


def _key_info(raw: str) -> dict | None:
    raw = raw.strip().strip('"').strip("'").strip()
    if not raw:
        return None
    if raw.startswith("{"):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # .env loaders here read one line at a time, so a pasted multi-line
            # key arrives as just "{". Say so instead of silently going DB-only.
            print("[gcal] GOOGLE_SERVICE_ACCOUNT_JSON looks like JSON split over several lines in .env; "
                  "set it to the key file's path instead (e.g. inmyways-xxxx.json)")
            return None
    path = Path(raw)
    path = path if path.is_absolute() else ROOT / path
    if not path.is_file():
        print(f"[gcal] GOOGLE_SERVICE_ACCOUNT_JSON: no key file at {path.name}")
        return None
    return json.loads(path.read_text(encoding="utf-8"))


class GoogleCalendar:
    def __init__(self, info: dict, timeout: float = 10.0):
        from google.oauth2 import service_account
        self._creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        self._timeout = timeout

    def _headers(self) -> dict:
        from google.auth.transport.requests import Request
        if not self._creds.valid:
            self._creds.refresh(Request())
        return {"Authorization": f"Bearer {self._creds.token}"}

    def insert(self, calendar_id: str, event: dict) -> str:
        import httpx
        resp = httpx.post(f"{API}/calendars/{calendar_id}/events", json=event,
                          headers=self._headers(), timeout=self._timeout)
        resp.raise_for_status()
        return resp.json()["id"]

    def delete(self, calendar_id: str, event_id: str) -> None:
        import httpx
        resp = httpx.delete(f"{API}/calendars/{calendar_id}/events/{event_id}",
                            headers=self._headers(), timeout=self._timeout)
        if resp.status_code not in (200, 204, 410):  # 410: already gone
            resp.raise_for_status()

    def list(self, calendar_id: str, time_min: str, time_max: str) -> list[dict]:
        import httpx
        resp = httpx.get(f"{API}/calendars/{calendar_id}/events", headers=self._headers(),
                         params={"timeMin": time_min, "timeMax": time_max,
                                 "singleEvents": "true", "maxResults": 250},
                         timeout=self._timeout)
        resp.raise_for_status()
        return resp.json().get("items", [])


def default_client():
    """The real client, or None when no key is configured (DB-only mode)."""
    _load_env()
    try:
        info = _key_info(os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", ""))
        return GoogleCalendar(info) if info else None
    except Exception as exc:  # bad key, missing library: DB-only still demos
        print(f"[gcal] Google Calendar disabled ({type(exc).__name__}): {exc}")
        return None
