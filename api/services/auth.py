"""Accounts & privacy (ROADMAP Phase 2) — sessions + scoping, plain code.

Deliberately small: PBKDF2 secret hashing and HMAC-signed session cookies
from the standard library. No identity provider, no JWT dependency.

Modes (IMW_AUTH env):
  open      (default) anyone may browse — the hackathon "main always demos"
            rule — but if a session cookie IS present, its scope is enforced,
            so cross-resident access still gets a 403.
  required  no session means 401 on every scoped endpoint. Use on the VM
            before any real-resident pilot.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

SESSION_COOKIE = "imw_session"
STAFF_SESSION_SECONDS = 12 * 3600  # staff shifts end; resident sessions do not expire
_PBKDF2_ITERATIONS = 60_000


def auth_mode() -> str:
    mode = os.environ.get("IMW_AUTH", "open").strip().lower()
    return mode if mode in ("open", "required") else "open"


def _secret() -> bytes:
    value = os.environ.get("SESSION_SECRET", "")
    if not value:
        value = "imw-dev-session-secret"  # fine for localhost; set SESSION_SECRET on the VM
    return value.encode()


# ---- secret hashing (PINs and passwords share one format) ----

def hash_secret(plain: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), _PBKDF2_ITERATIONS)
    return f"pbkdf2${_PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_secret(plain: str, stored: str) -> bool:
    try:
        scheme, iterations, salt, expected = stored.split("$")
        if scheme != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt.encode(), int(iterations))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, AttributeError):
        return False


# ---- signed session tokens ----

def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_session(user: dict) -> str:
    """user comes from the users table: role, resident_id, staff_id, display_name."""
    payload = {
        "uid": user.get("id"),
        "role": user["role"],
        "rid": user.get("resident_id"),
        "sid": user.get("staff_id"),
        "name": user.get("display_name", ""),
    }
    if user["role"] in ("staff", "manager"):
        payload["exp"] = int(time.time()) + STAFF_SESSION_SECONDS
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_session(token: str | None) -> dict | None:
    """Return the session payload, or None if missing/invalid/expired."""
    if not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None
    exp = payload.get("exp")
    if exp is not None and time.time() > exp:
        return None
    return payload


# ---- scope checks ----

def allowed_residents(session: dict | None, assignments: list[str]) -> str | list[str]:
    """'*' for managers/open access, else the resident ids this session may touch."""
    if session is None:
        return "*" if auth_mode() == "open" else []
    if session["role"] == "manager":
        return "*"
    if session["role"] == "resident":
        return [session["rid"]] if session.get("rid") else []
    return assignments  # staff: assigned residents only


def can_access(session: dict | None, resident_id: str, assignments: list[str]) -> bool:
    scope = allowed_residents(session, assignments)
    return scope == "*" or resident_id in scope
