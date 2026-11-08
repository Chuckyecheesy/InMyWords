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


def calendar_id_for(staff_id: str) -> str | None:
    """The Google calendar a staff member's visits land on."""
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
    raw = raw.strip()
    if not raw:
        return None
    if raw.startswith("{"):
        return json.loads(raw)
    path = Path(raw)
    path = path if path.is_absolute() else ROOT / path
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


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
    try:
        info = _key_info(os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", ""))
        return GoogleCalendar(info) if info else None
    except Exception as exc:  # bad key, missing library: DB-only still demos
        print(f"[gcal] Google Calendar disabled ({type(exc).__name__}): {exc}")
        return None
