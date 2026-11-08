"""actions MCP server (BUILD_PLAN T2.6), plan, approve, run.

Run:  python mcp/actions_server.py          (streamable HTTP on :8103)

Guardrails baked in:
- plan_actions only PROPOSES. Nothing runs until the resident approves.
- Every executing tool checks the plan is status='approved' and REFUSES
  otherwise, the gate lives here, not in the UI.
- cancel_plan honours the short cancel window (works until steps run).
- Every step is logged to action_results (visible in the activity log).
- Email is real when EMAIL_SENDER_* creds exist, otherwise logged as
  sent (the plan's venue fallback). Never sends money, never shares
  personal info, the allowlist below is the whole action surface.

plan_actions remains a deterministic placeholder for callers that
only have a goal. save_plan stores the plan the Action agent already
built. Cost is recomputed in code either way.
"""

import os
import smtplib
from email.message import EmailMessage

from fastmcp import FastMCP

from store import get_store

mcp = FastMCP("actions")

ALLOWED_STEPS = ("book_activity", "add_to_calendar", "send_message", "create_staff_task")

# Demo contacts (fictional). DEMO_CONTACT_EMAIL overrides so the live demo
# can show a real inbox receiving the message.
CONTACTS = {"lisa": {"name": "Lisa", "email": os.environ.get("DEMO_CONTACT_EMAIL", "lisa@example.com")}}


def _send_email(to_addr, subject, body):
    sender = os.environ.get("EMAIL_SENDER_ADDRESS")
    password = os.environ.get("EMAIL_SENDER_PASSWORD")
    if not sender or not password:
        return False, f"logged as sent to {to_addr} (no email creds configured)"
    try:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = sender, to_addr, subject
        msg.set_content(body)
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
            smtp.login(sender, password)
            smtp.send_message(msg)
        return True, f"email sent to {to_addr}"
    except Exception as exc:
        return False, f"logged as sent to {to_addr} (send failed: {type(exc).__name__})"


def _approved_plan_or_error(plan_id):
    store = get_store()
    plan = store.get_plan(plan_id)
    if not plan:
        return None, {"error": f"no plan {plan_id}"}
    if plan["status"] != "approved":
        return None, {"refused": True,
                      "error": f"plan {plan_id} is '{plan['status']}', not approved, "
                               "the resident must approve first"}
    return plan, None


@mcp.tool
def plan_actions(resident: str, goal: str) -> dict:
    """Split a goal into online steps + staff tasks with total cost.
    PROPOSES only, returns a plan for the resident's approval card.
    Placeholder for callers that do not pass the Action agent's steps."""
    goal_l = goal.lower()
    steps = []
    if "bowling" in goal_l:
        steps = [
            {"step": "book_activity", "kind": "online", "detail": "Lane at KW Bowl, Saturday 2:00pm",
             "activity": "Bowling, KW Bowl", "time": "2026-11-14T14:00:00", "cost": 15.0},
            {"step": "add_to_calendar", "kind": "online", "detail": "Bowling, Saturday 2:00pm",
             "title": "Bowling at KW Bowl", "time": "2026-11-14T14:00:00", "cost": 0},
            {"step": "send_message", "kind": "online", "contact": "lisa",
             "detail": "Email Lisa: bowling Saturday 2pm, want to come?",
             "text": f"{resident.capitalize()} is going bowling Saturday at 2pm and would love you to come.",
             "cost": 0},
            {"step": "create_staff_task", "kind": "staff", "detail": "Drive to KW Bowl",
             "task": f"Drive {resident.capitalize()} to KW Bowl", "time": "2026-11-14T13:30:00", "cost": 0},
        ]
    else:
        steps = [
            {"step": "add_to_calendar", "kind": "online", "detail": goal, "title": goal,
             "time": "2026-11-14T14:00:00", "cost": 0},
            {"step": "create_staff_task", "kind": "staff", "detail": f"Support with: {goal}",
             "task": f"Support {resident.capitalize()} with: {goal}", "time": "2026-11-14T13:30:00", "cost": 0},
        ]
    return _save_plan(resident, goal, steps, agent="placeholder-until-T4.7")


def _save_plan(resident: str, goal: str, steps: list, agent: str) -> dict:
    total = sum(s["cost"] for s in steps)  # plain code, never the LLM
    plan = get_store().create_plan(resident, goal, steps, total)
    return {
        "plan_id": plan["id"],
        "goal": goal,
        "online_steps": [s for s in steps if s["kind"] == "online"],
        "staff_tasks": [{"task": s.get("task", s["detail"]), "due": s.get("due") or s.get("time")}
                        for s in steps if s["kind"] == "staff"],
        "total_cost": total,
        "status": "proposed",
        "agent": agent,
    }


@mcp.tool
def save_plan(resident: str, goal: str, steps: list[dict]) -> dict:
    """Persist a plan built by the Action agent (T4.7). The server re-checks
    the allowlist and recomputes the total, so the agent cannot sneak in a
    tool or a cost. Status is always 'proposed'."""
    store = get_store()
    clean = [s for s in steps if s.get("step") in ALLOWED_STEPS]
    total = sum(float(s.get("cost", 0)) for s in clean if s.get("kind") != "staff")
    plan = store.create_plan(resident, goal, clean, total)
    return {
        "plan_id": plan["id"], "goal": goal,
        "online_steps": [s for s in clean if s.get("kind") != "staff"],
        "staff_tasks": [{"task": s.get("task", s.get("detail")), "due": s.get("time")}
                        for s in clean if s.get("kind") == "staff"],
        "total_cost": total, "status": "proposed", "agent": "action",
    }


@mcp.tool
def approve_plan(resident: str, plan_id: int) -> dict:
    """The resident approved the card: mark approved, run every step in
    order, log each to action_results, mark done. Returns results per step."""
    store = get_store()
    plan = store.get_plan(plan_id)
    if not plan:
        return {"error": f"no plan {plan_id}"}
    if plan["resident_id"] != resident:
        return {"error": "plan belongs to a different resident"}
    if plan["status"] != "proposed":
        return {"refused": True, "error": f"plan is '{plan['status']}', only proposed plans can be approved"}

    store.set_plan_status(plan_id, "approved")
    results = []
    for s in plan["steps"]:
        if s["step"] not in ALLOWED_STEPS:
            result = f"SKIPPED '{s['step']}', not on the allowlist"
        elif s["step"] == "book_activity":
            store.add_booking(resident, s["activity"], s["time"])
            result = f"Booked: {s['activity']}, {s['time']}"
        elif s["step"] == "add_to_calendar":
            store.add_calendar_event(resident, s["title"], s["time"])
            result = f"Added to calendar: {s['title']}"
            # TODO(stretch): dual-write to the resident's Google Calendar
        elif s["step"] == "send_message":
            contact = CONTACTS.get(s.get("contact", ""), {"name": s.get("contact", "?"), "email": None})
            if contact["email"]:
                _, detail = _send_email(contact["email"], f"From {resident.capitalize()}", s["text"])
                result = detail
            else:
                result = f"logged as sent to {contact['name']} (no known email)"
        elif s["step"] == "create_staff_task":
            store.create_staff_task(resident, s["task"], s.get("time"))
            result = f"Staff task created: {s['task']}"
        store.log_action_result(plan_id, s["step"], result)
        results.append({"step": s["step"], "result": result})
    store.set_plan_status(plan_id, "done")
    return {"plan_id": plan_id, "results": results, "status": "done"}


@mcp.tool
def cancel_plan(resident: str, plan_id: int) -> dict:
    """Cancel within the window, works while the plan is proposed or
    approved-but-not-run."""
    store = get_store()
    plan = store.get_plan(plan_id)
    if not plan or plan["resident_id"] != resident:
        return {"error": f"no plan {plan_id} for '{resident}'"}
    if plan["status"] == "done":
        return {"refused": True, "error": "plan already ran, ask staff to help undo the steps"}
    store.set_plan_status(plan_id, "cancelled")
    store.log_action_result(plan_id, "cancel", "Cancelled by the resident")
    return {"plan_id": plan_id, "status": "cancelled"}


@mcp.tool
def send_message(resident: str, contact: str, text: str, plan_id: int) -> dict:
    """Send a message, ONLY as part of an approved plan."""
    plan, err = _approved_plan_or_error(plan_id)
    if err:
        return err
    info = CONTACTS.get(contact.lower())
    if not info:
        return {"error": f"'{contact}' is not a known contact"}
    _, detail = _send_email(info["email"], f"From {resident.capitalize()}", text)
    get_store().log_action_result(plan_id, "send_message", detail)
    return {"result": detail}


@mcp.tool
def add_to_calendar(resident: str, event: str, time: str, plan_id: int) -> dict:
    """Add a calendar entry, ONLY as part of an approved plan."""
    plan, err = _approved_plan_or_error(plan_id)
    if err:
        return err
    store = get_store()
    store.add_calendar_event(resident, event, time)
    store.log_action_result(plan_id, "add_to_calendar", f"Added to calendar: {event}")
    return {"result": f"Added to calendar: {event}"}


@mcp.tool
def book_activity(resident: str, activity: str, time: str, plan_id: int) -> dict:
    """Book an activity on the mock booking site, ONLY as part of an
    approved plan."""
    plan, err = _approved_plan_or_error(plan_id)
    if err:
        return err
    store = get_store()
    store.add_booking(resident, activity, time)
    store.log_action_result(plan_id, "book_activity", f"Booked: {activity}, {time}")
    return {"result": f"Booked: {activity}, {time}"}


@mcp.tool
def create_staff_task(resident: str, task: str, time: str = "", plan_id: int = 0) -> dict:
    """Create a task in staff Handoff. Allowed outside a plan too, staff
    tasks are requests for human help, not autonomous actions."""
    store = get_store()
    store.create_staff_task(resident, task, time or None)
    if plan_id:
        store.log_action_result(plan_id, "create_staff_task", f"Staff task created: {task}")
    return {"result": f"Staff task created: {task}"}


@mcp.tool
def get_staff_tasks(resident: str = "") -> dict:
    """Open and done staff tasks, optionally filtered to one resident.
    (Additive read tool, Handoff shows these.)"""
    store = get_store()
    tasks = store.get_staff_tasks(resident or None)
    return {"tasks": [{"resident": t["resident_id"], "task": t["task"],
                       "due": t.get("due_at"), "status": t["status"]} for t in tasks]}


@mcp.tool
def request_staff_help(resident: str) -> dict:
    """'Get staff help' (ROADMAP Phase 6): the resident asked the on-duty
    staff member to come. Creates an URGENT staff task. This is an in-app
    notification to staff — explicitly NOT emergency services."""
    store = get_store()
    row = store.create_staff_task(
        resident, "Came to see what they need (resident pressed Get staff help).",
        None, priority="urgent")
    return {"request": _help_row(row), "store_mode": store.mode}


@mcp.tool
def get_help_requests(resident: str = "", open_only: bool = True) -> dict:
    """Urgent help requests, newest first: the resident screen polls its own
    (acknowledged yet?), staff screens poll all for the banner."""
    store = get_store()
    rows = store.get_help_requests(resident or None, open_only)
    return {"requests": [_help_row(r) for r in rows], "store_mode": store.mode}


@mcp.tool
def acknowledge_help(task_id: int, staff: str) -> dict:
    """A staff member saw the request and is coming. Logged, never deleted."""
    store = get_store()
    row = store.acknowledge_task(task_id, staff)
    if not row:
        return {"error": f"no help request {task_id}"}
    return {"request": _help_row(row), "store_mode": store.mode}


def _help_row(row) -> dict:
    return {"id": row["id"], "resident_id": row["resident_id"],
            "status": row["status"], "created_at": str(row.get("created_at") or ""),
            "acknowledged_by": row.get("acknowledged_by"),
            "acknowledged_at": str(row.get("acknowledged_at") or "") or None}


@mcp.tool
def get_activity(resident: str) -> dict:
    """Activity log: sentences, choices, plans and executed steps, newest first."""
    store = get_store()
    return {"resident": resident, "items": store.get_activity(resident)}


# =============================================================================
# My Planner -> Google Calendar (PROJECT_PLAN §2.5, BUILD_PLAN T2.6)
#
# Two routes write a visit, both through _write_visit, both idempotent:
#   - write_calendar_event: the gated single write the Gemini Planner
#     subagent (api/agents/planner.py) calls, one tool call per visit.
#   - book_staff_visit: the deterministic route. It writes whatever is
#     still unsynced, used when Gemini is off, fails or leaves visits out.
# visit_events is the source of truth. A visit is approved in the DB before
# any Google call. A down calendar never fails the booking (DB-only mode).
# =============================================================================

_UNSET = object()
_calendar = _UNSET


def set_calendar_client(client) -> None:
    """Inject a calendar client (tests, or None to force DB-only). Not an MCP
    tool: objects can't cross the wire."""
    global _calendar
    _calendar = client


def _calendar_client():
    global _calendar
    if _calendar is _UNSET:
        from gcal import default_client
        _calendar = default_client()
    return _calendar


def _calendar_id(staff_id: str) -> str:
    from gcal import calendar_id_for
    return calendar_id_for(staff_id) or staff_id


_TEXT_LIMITS = {"summary": 80, "description": 240}


def _plain(text, field: str) -> str:
    """Model wording made safe for a shared calendar: one line, short, no
    email addresses, phone numbers or money."""
    import re
    text = " ".join(str(text or "").split())
    text = re.sub(r"\S+@\S+", "", text)
    text = re.sub(r"\+?\d[\d\s().-]{6,}\d", "", text)
    text = text.replace("$", "")
    return " ".join(text.split())[:_TEXT_LIMITS[field]].strip()


def _resident_name(store, resident: str) -> str:
    r = store.get_resident(resident)
    return r["first_name"] if r else resident.capitalize()


def _write_visit(store, visit: dict, name: str, summary: str = "", description: str = "",
                 writer: str = "rules") -> dict:
    """Put one approved visit on its staff member's Google Calendar.
    Times always come from the DB row, never from the caller."""
    from calendar_core import DEFAULT_TZ, google_event

    if visit.get("google_event_id"):
        return {"visit_id": visit["id"], "skipped": True, "reason": "already on the calendar",
                "google_event_id": visit["google_event_id"]}
    client = _calendar_client()
    if client is None:
        return {"visit_id": visit["id"], "calendar_down": True,
                "error": "Google Calendar is not connected; the visit is saved in the app"}
    summary = _plain(summary, "summary") or f"Visit with {name}"
    description = _plain(description, "description") or "Staff visit set in My Planner"
    lowered = description.lower()
    if not (name.lower() in lowered and "approv" in lowered):  # "Dana approved this" counts
        description = f"{description.rstrip('.')}, approved by {name}."
    event = google_event(summary, description, visit["starts_at"], visit["ends_at"], DEFAULT_TZ)
    try:
        google_id = client.insert(_calendar_id(visit["staff_id"]), event)
    except Exception as exc:
        return {"visit_id": visit["id"], "calendar_down": True,
                "error": f"Google Calendar unreachable ({type(exc).__name__}); the visit is saved in the app"}
    store.set_visit_google_id(visit["id"], google_id)
    store.log_action_result(None, "book_staff_visit",
                            f"Visit {visit['starts_at']} on {visit['staff_id']}'s calendar ({writer})")
    return {"visit_id": visit["id"], "google_event_id": google_id}


def _routine_or_error(store, resident: str, routine_id: int):
    routine = store.get_routine(routine_id)
    if not routine or routine["resident_id"] != resident:
        return None, {"error": f"no routine {routine_id} for '{resident}'"}
    return routine, None


def _booking_summary(store, resident: str, routine_id: int, planner: str) -> dict:
    from store import visit_view
    name = _resident_name(store, resident)
    visits = store.get_visits(routine_id=routine_id)
    synced = [v["google_event_id"] for v in visits if v.get("google_event_id")]
    return {"routine_id": routine_id, "visits": [visit_view(v, name) for v in visits],
            "google_event_ids": synced, "google_synced": bool(visits) and len(synced) == len(visits),
            "planner": planner}


@mcp.tool
def approve_visits(resident: str, routine_id: int, approved: bool) -> dict:
    """The resident approved the planner card: mark every visit of the
    routine approved in the DB (source of truth) before anything reaches
    Google. Refused unless approved is true."""
    from store import visit_view
    if approved is not True:
        return {"refused": True, "error": "the resident must approve the visits first"}
    store = get_store()
    _, err = _routine_or_error(store, resident, routine_id)
    if err:
        return err
    name = _resident_name(store, resident)
    return {"routine_id": routine_id, "resident_name": name,
            "visits": [visit_view(v, name) for v in store.approve_routine(routine_id)]}


@mcp.tool
def write_calendar_event(resident: str, visit_id: int, start: str, end: str,
                         summary: str = "", description: str = "") -> dict:
    """Write ONE approved visit to its staff member's Google Calendar. This is
    the gated write the Planner subagent calls. Refused unless the visit is
    approved; start/end must match the approved visit exactly (the times
    written always come from the DB); a visit already on the calendar is
    skipped, so retries never double-book."""
    from calendar_core import parse_dt
    store = get_store()
    visit = store.get_visit(int(visit_id))
    if not visit or visit["resident_id"] != resident:
        return {"error": f"no visit {visit_id} for '{resident}'"}
    if not visit["approved"]:
        return {"refused": True, "error": f"visit {visit_id} is not approved yet"}
    if (visit.get("status") or "accepted") != "accepted":
        return {"refused": True, "error": f"visit {visit_id} is waiting for {visit['staff_id']} to accept it"}
    try:
        same = (parse_dt(start) == parse_dt(visit["starts_at"])
                and parse_dt(end) == parse_dt(visit["ends_at"]))
    except ValueError:
        same = False
    if not same:
        return {"error": "times do not match the approved visit; "
                         f"use start={visit['starts_at']} end={visit['ends_at']}"}
    return _write_visit(store, visit, _resident_name(store, resident), summary, description, writer="gemini")


def _accepted(visit: dict) -> bool:
    return (visit.get("status") or "accepted") == "accepted"


def _sync(store, visits: list[dict]) -> None:
    """Write every accepted, unsynced visit to Google. Stops at the first
    sign the calendar is down."""
    names: dict[str, str] = {}
    for visit in visits:
        if not (visit["approved"] and _accepted(visit)):
            continue  # pending or rejected visits never reach Google
        name = names.setdefault(visit["resident_id"], _resident_name(store, visit["resident_id"]))
        if _write_visit(store, visit, name).get("calendar_down"):
            break  # one failure means the calendar is down; don't hammer it


@mcp.tool
def book_staff_visit(resident: str, routine_id: int, approved: bool) -> dict:
    """Deterministic route: approve the routine's visits in the DB. Each visit
    is then a request waiting for staff (status pending, PROJECT_PLAN §2.5);
    only visits staff already accepted are written to Google. Refused unless
    approved. If Google is down, the visits stay booked in the app."""
    if approved is not True:
        return {"refused": True, "error": "the resident must approve the visits first"}
    store = get_store()
    _, err = _routine_or_error(store, resident, routine_id)
    if err:
        return err
    _sync(store, store.approve_routine(routine_id))  # DB first, always
    return _booking_summary(store, resident, routine_id, planner="rules")


_DECISIONS = {"accept": "accepted", "reject": "rejected"}


def _visits_view(store, visits: list[dict]) -> list[dict]:
    from store import visit_view
    out = []
    for v in visits:
        name = _resident_name(store, v["resident_id"])
        out.append({**visit_view(v, name), "resident": v["resident_id"], "resident_name": name})
    return out


@mcp.tool
def respond_to_visit(staff: str, visit_ids: list[int], decision: str) -> dict:
    """Staff answer a visit the resident approved: "accept" or "reject"
    (PROJECT_PLAN §2.5). Only the staff member named on every visit may
    answer, only once, and only after the resident approved. All or nothing:
    one bad visit changes none. Status only; Google is written by
    sync_accepted_visits (or the Planner subagent's write_calendar_event)."""
    status = _DECISIONS.get(decision)
    if status is None:
        return {"error": "decision must be 'accept' or 'reject'"}
    try:
        ids = [int(i) for i in visit_ids]
    except (TypeError, ValueError):
        return {"error": "visit_ids must be visit numbers"}
    if not ids:
        return {"error": "choose at least one visit"}
    store = get_store()
    visits = []
    for visit_id in ids:
        visit = store.get_visit(visit_id)
        if not visit:
            return {"error": f"no visit {visit_id}"}
        if visit["staff_id"] != staff:
            return {"refused": True, "error": f"visit {visit_id} is for {visit['staff_id']}, not {staff}"}
        if not visit["approved"]:
            return {"error": f"visit {visit_id} is not approved by the resident yet"}
        if (visit.get("status") or "accepted") != "pending":
            return {"error": f"visit {visit_id} was already answered"}
        visits.append(visit)
    updated = store.set_visit_status(ids, status, staff)
    for v in updated:
        store.log_action_result(None, "respond_to_visit",
                                f"{staff} {decision}ed visit {v['id']} ({v['starts_at']}) for {v['resident_id']}")
    return {"staff": staff, "decision": decision, "visits": _visits_view(store, updated)}


@mcp.tool
def sync_accepted_visits(staff: str, visit_ids: list[int]) -> dict:
    """Deterministic route after staff accept: write each accepted visit not
    yet on Google to the staff member's calendar. Pending and rejected
    visits are skipped. Idempotent; a down calendar never fails it."""
    store = get_store()
    visits = [v for v in (store.get_visit(int(i)) for i in visit_ids) if v and v["staff_id"] == staff]
    _sync(store, visits)
    visits = [store.get_visit(v["id"]) for v in visits]
    accepted = [v for v in visits if _accepted(v) and v["approved"]]
    synced = [v["google_event_id"] for v in accepted if v.get("google_event_id")]
    return {"staff": staff, "visits": _visits_view(store, visits), "google_event_ids": synced,
            "google_synced": bool(accepted) and len(synced) == len(accepted)}


@mcp.tool
def get_booking(resident: str, routine_id: int) -> dict:
    """Where a routine's visits stand: approved, and which are on Google."""
    store = get_store()
    _, err = _routine_or_error(store, resident, routine_id)
    return err or _booking_summary(store, resident, routine_id, planner="")


# ---- .zip calendar exports --------------------------------------------------------

def _zip_events(calendar_zip_b64: str):
    import base64
    import binascii
    from calendar_core import DEFAULT_TZ, parse_calendar_zip
    try:
        data = base64.b64decode(calendar_zip_b64 or "", validate=True)
    except (binascii.Error, ValueError):
        return None, {"error": "the upload could not be read; please try the .zip again"}
    try:
        return parse_calendar_zip(data, tz=DEFAULT_TZ), None
    except ValueError as exc:
        return None, {"error": str(exc)}


@mcp.tool
def import_calendar(resident: str, calendar_zip_b64: str, start_date: str = "", days: int = 63) -> dict:
    """Fallback A (Google / MCP path down): show staff visit hours from an
    uploaded Google Calendar .zip export on the planner grid, for the window
    start_date + days (default: today, 9 weeks). Repeating events are
    expanded into that window (a weekly series begun in 2023 still shows).
    READ-ONLY: nothing is written to Google or saved as a booking."""
    from datetime import date, datetime, time, timedelta
    from zoneinfo import ZoneInfo
    from calendar_core import DEFAULT_TZ, occurrences
    store = get_store()
    if not store.get_resident(resident):
        return {"error": f"unknown resident '{resident}'"}
    zone = ZoneInfo(DEFAULT_TZ)
    try:
        first = date.fromisoformat(start_date) if start_date else datetime.now(zone).date()
        span = max(1, min(int(days), 366))
    except (ValueError, TypeError):
        return {"error": "start_date must look like 2026-11-08"}
    events, err = _zip_events(calendar_zip_b64)
    if err:
        return err
    lo = datetime.combine(first, time(0), tzinfo=zone)
    hi = datetime.combine(first + timedelta(days=span), time(0), tzinfo=zone)
    label = f"From staff calendar, {datetime.now(zone).date().isoformat()}"
    visits = [{**occ, "source": "staff", "label": label, "read_only": True}
              for occ in occurrences(events, lo, hi, DEFAULT_TZ)]
    return {"resident": resident, "visits": visits, "read_only": True,
            "window": {"start": first.isoformat(), "days": span}}


def _existing_spans(client, calendar_id: str, events: list[dict]):
    from calendar_core import event_span, parse_dt
    if not events:
        return []
    lo = min(parse_dt(e["starts_at"]) for e in events)
    hi = max(parse_dt(e["ends_at"]) for e in events)
    found = client.list(calendar_id, lo.isoformat(), hi.isoformat())
    return [s for s in (event_span(x) for x in found) if s]


def _is_duplicate(event: dict, spans) -> bool:
    from calendar_core import overlaps, parse_dt
    s, e = parse_dt(event["starts_at"]), parse_dt(event["ends_at"])
    return any(overlaps(s, e, a, b) for a, b in spans)


@mcp.tool
def propose_calendar_import(staff: str, calendar_zip_b64: str) -> dict:
    """Staff calendar import, step 1 (stretch): unpack + parse + normalize the
    .zip and flag events that overlap what is already on staff's calendar.
    WRITES NOTHING to Google; the result is for the approval card."""
    import uuid
    store = get_store()
    if not store.get_staff(staff):
        return {"error": f"unknown staff '{staff}'"}
    events, err = _zip_events(calendar_zip_b64)
    if err:
        return err
    if not events:
        return {"error": "no calendar events found in that .zip"}
    proposal = [{"id": f"e{i + 1}", "title": e["title"], "starts_at": e["starts_at"],
                 "ends_at": e["ends_at"], "recurrence": e["recurrence"]} for i, e in enumerate(events)]
    check = "done"
    client = _calendar_client()
    spans = []
    try:
        spans = _existing_spans(client, _calendar_id(staff), proposal) if client else []
        check = "done" if client else "unavailable"
    except Exception:
        check = "unavailable"
    for e in proposal:
        e["duplicate"] = _is_duplicate(e, spans)
    record = store.save_calendar_import(f"imp-{uuid.uuid4().hex[:10]}", staff, proposal)
    return {"import_id": record["id"], "staff": staff, "events": proposal, "duplicate_check": check}


def _import_or_error(store, staff: str, import_id: str):
    rec = store.get_calendar_import(import_id)
    if not rec or rec["staff_id"] != staff:
        return None, {"error": f"no calendar import '{import_id}' for '{staff}'"}
    return rec, None


def _write_imported(store, rec: dict, event: dict, spans, summary: str = "", writer: str = "rules") -> dict:
    from calendar_core import DEFAULT_TZ, google_event
    if event["id"] in (rec.get("committed") or {}):
        return {"event_id": event["id"], "skipped": True, "reason": "already imported"}
    if event.get("duplicate") or _is_duplicate(event, spans):
        return {"event_id": event["id"], "skipped": True, "duplicate": True,
                "reason": "overlaps an event already on the calendar"}
    client = _calendar_client()
    if client is None:
        return {"event_id": event["id"], "calendar_down": True, "error": "Google Calendar is not connected"}
    title = _plain(summary, "summary") or event["title"]
    payload = google_event(title, f"Imported from {rec['staff_id']}'s calendar export.",
                           event["starts_at"], event["ends_at"], DEFAULT_TZ, event.get("recurrence"))
    try:
        google_id = client.insert(_calendar_id(rec["staff_id"]), payload)
    except Exception as exc:
        return {"event_id": event["id"], "calendar_down": True,
                "error": f"Google Calendar unreachable ({type(exc).__name__})"}
    store.mark_import_committed(rec["id"], event["id"], google_id)
    rec.setdefault("committed", {})[event["id"]] = google_id
    store.log_action_result(None, "commit_calendar_import",
                            f"Imported '{title}' {event['starts_at']} to {rec['staff_id']}'s calendar ({writer})")
    return {"event_id": event["id"], "google_event_id": google_id}


def _commit_gate(store, staff, import_id, approved_ids, approved):
    rec, err = _import_or_error(store, staff, import_id)
    if err:
        return None, None, err
    if approved is not True:
        return None, None, {"refused": True, "error": "staff must approve the import first"}
    by_id = {e["id"]: e for e in rec["events"]}
    unknown = [i for i in approved_ids if i not in by_id]
    if unknown:
        return None, None, {"error": f"not in this import: {', '.join(map(str, unknown))}"}
    client = _calendar_client()
    if client is None:
        return None, None, {"error": "Google Calendar is not connected"}
    picked = [by_id[i] for i in approved_ids]
    try:
        spans = _existing_spans(client, _calendar_id(staff), picked)
    except Exception as exc:
        return None, None, {"error": f"Google Calendar unreachable ({type(exc).__name__}); nothing was imported"}
    return rec, (picked, spans), None


@mcp.tool
def write_imported_event(staff: str, import_id: str, event_id: str, start: str, end: str,
                         summary: str = "") -> dict:
    """Staff import, gated single write for the Planner subagent: one event
    from an APPROVED import. start/end must match the proposal; duplicates and
    already-imported events are skipped."""
    from calendar_core import parse_dt
    store = get_store()
    rec, err = _import_or_error(store, staff, import_id)
    if err:
        return err
    if not rec.get("approved"):
        return {"refused": True, "error": "staff must approve the import first"}
    event = next((e for e in rec["events"] if e["id"] == event_id), None)
    if not event or event_id not in rec.get("approved_ids", []):
        return {"error": f"event '{event_id}' was not approved in this import"}
    try:
        same = parse_dt(start) == parse_dt(event["starts_at"]) and parse_dt(end) == parse_dt(event["ends_at"])
    except ValueError:
        same = False
    if not same:
        return {"error": f"times do not match; use start={event['starts_at']} end={event['ends_at']}"}
    client = _calendar_client()
    try:
        spans = _existing_spans(client, _calendar_id(staff), [event]) if client else []
    except Exception as exc:
        return {"event_id": event_id, "calendar_down": True, "error": f"Google Calendar unreachable ({type(exc).__name__})"}
    return _write_imported(store, rec, event, spans, summary, writer="gemini")


@mcp.tool
def approve_calendar_import(staff: str, import_id: str, approved_ids: list[str], approved: bool) -> dict:
    """Staff ticked events on the approval card. Records the approval so the
    subagent's gated writes (write_imported_event) are allowed. Writes nothing."""
    store = get_store()
    rec, err = _import_or_error(store, staff, import_id)
    if err:
        return err
    if approved is not True:
        return {"refused": True, "error": "staff must approve the import first"}
    by_id = {e["id"]: e for e in rec["events"]}
    unknown = [i for i in approved_ids if i not in by_id]
    if unknown:
        return {"error": f"not in this import: {', '.join(map(str, unknown))}"}
    store.approve_calendar_import(import_id, list(approved_ids))
    return {"import_id": import_id, "events": [by_id[i] for i in approved_ids]}


@mcp.tool
def commit_calendar_import(staff: str, import_id: str, approved_ids: list[str], approved: bool) -> dict:
    """Staff calendar import, deterministic route: insert each approved event
    into staff's live Google Calendar with events.insert. Refused unless
    approved; events overlapping the calendar are skipped; re-running never
    double-inserts."""
    store = get_store()
    rec, ready, err = _commit_gate(store, staff, import_id, approved_ids, approved)
    if err:
        return err
    picked, spans = ready
    written, skipped = [], []
    for event in picked:
        result = _write_imported(store, rec, event, spans)
        if result.get("calendar_down"):
            return {"error": result["error"], "import_id": import_id,
                    "google_event_ids": written, "skipped": skipped}
        if result.get("google_event_id"):
            written.append(result["google_event_id"])
        elif result.get("duplicate"):
            skipped.append(event["id"])
    return {"import_id": import_id, "google_event_ids": written, "skipped": skipped, "planner": "rules"}


if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=8103)
