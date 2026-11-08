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


if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=8103)
